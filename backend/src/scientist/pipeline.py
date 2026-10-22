"""Ask pipeline: scope check, search strategy, parallel Hermes branches, synthesis."""
import asyncio
import json
import re
from collections.abc import AsyncIterator
from contextlib import aclosing, suppress
from pathlib import Path

import httpx

from scientist import llm
from scientist.citations import verify_references
from scientist.config import Settings
from scientist.events import (BranchAnswer, Complete, Error, Event, FinalAnswer, Reference, Refused, Search,
                              Sources, Strategy, Waiting, arxiv_id, paper_key)
from scientist.gate import RunGate
from scientist.guardrail import check_scope
from scientist.hermes import BranchFailed, BranchRunner, InvalidPaper

PROMPTS = Path(__file__).parent / "prompts"
STRATEGY = (PROMPTS / "strategy.md").read_text()
SYNTHESIS = (PROMPTS / "synthesis.md").read_text()
THAI = re.compile("[฀-๿]")
DONE = object()


async def _strategy(question: str, settings: Settings) -> Strategy | None:
    try:
        r = await llm.complete(STRATEGY, f"Question:\n{question}", max_tokens=settings.strategy_max_tokens,
                               json_mode=True, settings=settings)
        data = json.loads(r.text)
        searches = [Search(term=str(s.get("term") or "").strip(), instructions=str(s.get("instructions") or "").strip())
                    for s in data["searches"]]
        reasoning = str(data.get("reasoning") or "")
    except Exception:  # empty completion, network, bad JSON or shape
        return None
    # scholarly APIs are searched in English; a Thai term is a model slip, drop it
    searches = [s for s in searches if s.term and not THAI.search(s.term)][:settings.max_branches]
    return Strategy(reasoning=reasoning, searches=searches) if searches else None


def _data_block(references: list[Reference], answers: list[BranchAnswer]) -> str:
    data = {"references": [{"id": r.id, "status": r.status, **r.paper.model_dump()} for r in references],
            "findings": [{"search": a.term, "summary": a.content} for a in answers]}
    # JSON keeps the text a string; escaping "<" stops it from closing the block early
    return "<data>\n" + json.dumps(data, ensure_ascii=False, indent=1).replace("<", "\\u003c") + "\n</data>"


def _has_id(r: Reference) -> bool:
    return bool(r.paper.doi or r.paper.pmid or arxiv_id(r.paper.url))


def _ids(refs: list[Reference], status: str) -> str:
    return "".join(f"[{r.id}]" for r in refs if r.status == status)


async def ask(question: str, runner: BranchRunner, *, settings: Settings, client: httpx.AsyncClient,
              gate: RunGate) -> AsyncIterator[Event]:
    """Scope check, then, holding a gate slot: strategy, branches, citation check (via client), synthesis."""
    verdict = await check_scope(question, settings=settings)
    if not verdict.in_scope:
        yield Refused(reason=verdict.reason)  # refusals never queue or take a slot
        return
    async with aclosing(gate.acquire()) as waits:
        async for position in waits:
            yield Waiting(position=position)
    try:
        # aclosing: when our consumer goes away, _run's cleanup (killing the bridges) runs now, not at GC
        async with aclosing(_run(question, runner, settings, client)) as events:
            async for e in events:
                yield e
    finally:
        gate.release()


async def _run(question: str, runner: BranchRunner, settings: Settings, client: httpx.AsyncClient) -> AsyncIterator[Event]:
    plan = await _strategy(question, settings)
    if plan is None:
        yield Error(message="Could not plan a search for this question. Please rephrase it and try again.")
        return
    yield plan

    queue: asyncio.Queue = asyncio.Queue()

    async def branch(s: Search) -> None:
        try:
            async for item in runner.run(s.term, s.instructions):
                await queue.put((s.term, item))
        except Exception as e:  # a runner bug in one branch must not stop the others
            await queue.put((s.term, BranchFailed(term=s.term, reason=type(e).__name__)))

    async def run_all() -> None:
        try:
            await asyncio.gather(*(branch(s) for s in plan.searches))
        finally:
            queue.put_nowait(DONE)

    task = asyncio.create_task(run_all())
    references: dict[str, Reference] = {}
    answers: list[BranchAnswer] = []
    failed: list[str] = []
    rejected: set[str] = set()
    unkeyed = 0  # rejections with no identity at all
    per_branch: dict[str, int] = {}
    capped = 0  # papers past max_papers_per_branch
    try:
        while (msg := await queue.get()) is not DONE:
            term, item = msg
            if isinstance(item, BranchFailed):
                failed.append(term)
            elif isinstance(item, InvalidPaper):
                if item.key:
                    rejected.add(item.key)
                else:
                    unkeyed += 1
            elif isinstance(item, BranchAnswer):
                answers.append(item)  # held back so all sources events come before the answers
            elif (n := per_branch.get(term, 0)) >= settings.max_papers_per_branch:
                capped += 1
            else:
                per_branch[term] = n + 1
                references.setdefault(paper_key(item.doi, item.pmid, item.title, item.url), Reference(id=str(len(references) + 1), paper=item, status="unknown"))
                yield Sources(term=term, papers=[item])
    finally:
        task.cancel()  # consumer gone (client disconnect): stop branches, which kills their bridges
        with suppress(asyncio.CancelledError):
            await task

    dropped = len(rejected - references.keys()) + unkeyed  # a corrected retry is not a drop
    if not references and dropped:
        yield Error(message=f"{dropped} paper(s) were found but none had usable metadata (a title and an http(s) "
                            "link), so there is nothing to answer from.")
        return
    if not references:
        yield Error(message="No papers were found for this question, so there is nothing to answer from.")
        return
    for a in answers:
        yield a

    # same keys, same order
    refs = await verify_references([r.paper for r in references.values()], client=client,
                                   contact_email=settings.contact_email)
    note = "".join(f'\n\nNote: the search for "{t}" failed, so this answer does not cover it.' for t in failed)
    if dropped:
        note += f"\n\nNote: {dropped} paper(s) were left out because their metadata was invalid."
    if capped:
        note += (f"\n\nNote: {capped} paper(s) were left out because a search reported more than "
                 f"{settings.max_papers_per_branch}.")
    unverified = [r for r in refs if r.status == "unverified"]
    if ids := _ids([r for r in unverified if _has_id(r)], "unverified"):
        note += (f"\n\nWarning: reference(s) {ids} could not be confirmed to exist (the DOI, PubMed ID or arXiv ID "
                 "was not found in Crossref, doi.org, PubMed or arXiv). Treat claims that cite only them as unconfirmed.")
    if ids := _ids([r for r in unverified if not _has_id(r)], "unverified"):
        note += (f"\n\nWarning: reference(s) {ids} have no DOI, PubMed ID or arXiv ID, so their existence could not "
                 "be checked. Treat claims that cite only them as unconfirmed.")
    if ids := _ids(refs, "unknown"):
        note += f"\n\nNote: reference(s) {ids} could not be checked (the lookup service did not answer)."
    if not answers:  # papers but no branch summary: say so plainly; never synthesise a comparison from titles alone
        yield FinalAnswer(content=f"Found {len(refs)} paper(s), but the search did not finish summarising them. "
                                  "The references below were found and checked; try again or narrow the question."
                                  + note, references=refs)
        yield Complete()
        return
    user = (_data_block(refs, answers)
            + "".join(f'\nThe search for "{t}" failed and returned no findings.' for t in failed)
            + f"\n\nQuestion:\n{question}")
    try:
        r = await llm.complete(SYNTHESIS, user, max_tokens=settings.synthesis_max_tokens, settings=settings)
    except Exception:
        yield Error(message="Could not write the answer. Please try again.")
        return
    yield FinalAnswer(content=r.text.strip() + note, references=refs)
    yield Complete()

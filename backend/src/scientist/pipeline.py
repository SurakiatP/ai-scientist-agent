"""Ask pipeline: scope check, search strategy, parallel Hermes branches, synthesis."""
import asyncio
import json
import re
from collections.abc import AsyncIterator
from contextlib import suppress
from pathlib import Path

from scientist import llm
from scientist.config import Settings
from scientist.events import (BranchAnswer, Complete, Error, Event, FinalAnswer, Reference, Refused, Search,
                              Sources, Strategy, paper_key)
from scientist.guardrail import check_scope
from scientist.hermes import BranchFailed, BranchRunner, InvalidPaper

PROMPTS = Path(__file__).parent / "prompts"
STRATEGY = (PROMPTS / "strategy.md").read_text()
SYNTHESIS = (PROMPTS / "synthesis.md").read_text()
THAI = re.compile("[฀-๿]")
DONE = object()


async def _strategy(question: str, settings: Settings) -> Strategy | None:
    try:
        r = await llm.complete(STRATEGY, f"Question:\n{question}", max_tokens=800, json_mode=True, settings=settings)
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
    data = {"references": [{"id": r.id, **r.paper.model_dump()} for r in references],
            "findings": [{"search": a.term, "summary": a.content} for a in answers]}
    # JSON keeps the text a string; escaping "<" stops it from closing the block early
    return "<data>\n" + json.dumps(data, ensure_ascii=False, indent=1).replace("<", "\\u003c") + "\n</data>"


async def ask(question: str, runner: BranchRunner, *, settings: Settings) -> AsyncIterator[Event]:
    verdict = await check_scope(question, settings=settings)
    if not verdict.in_scope:
        yield Refused(reason=verdict.reason)
        return
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
            else:
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
    if not answers or not references:
        yield Error(message="No papers were found for this question, so there is nothing to answer from.")
        return
    for a in answers:
        yield a

    note = "".join(f'\n\nNote: the search for "{t}" failed, so this answer does not cover it.' for t in failed)
    if dropped:
        note += f"\n\nNote: {dropped} paper(s) were left out because their metadata was invalid."
    user = (_data_block(list(references.values()), answers)
            + "".join(f'\nThe search for "{t}" failed and returned no findings.' for t in failed)
            + f"\n\nQuestion:\n{question}")
    try:
        r = await llm.complete(SYNTHESIS, user, max_tokens=2000, settings=settings)
    except Exception:
        yield Error(message="Could not write the answer. Please try again.")
        return
    yield FinalAnswer(content=r.text.strip() + note, references=list(references.values()))
    yield Complete()

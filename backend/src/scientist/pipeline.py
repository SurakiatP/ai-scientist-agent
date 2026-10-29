"""Ask pipeline: scope check, search strategy, parallel Hermes branches, synthesis."""
import asyncio
import json
import logging
import re
import unicodedata
from collections.abc import AsyncIterator
from contextlib import aclosing, suppress
from pathlib import Path

import httpx
from pydantic import ValidationError

from scientist import llm, usage
from scientist.citations import verify_references
from scientist.config import Settings
from scientist.events import (BranchAnswer, Check, Complete, DataRecord, Error, Event, FinalAnswer, Paper, Records, Reference, Refused,
                              Replan, Search, Sources, Strategy, Waiting, arxiv_id, paper_key)
from scientist.gate import RunGate
from scientist.guardrail import guard
from scientist.hermes import BranchFailed, BranchRunner, BranchUsage, InvalidPaper, InvalidRecord
from scientist.sources import DATA_SOURCES

log = logging.getLogger(__name__)
PROMPTS = Path(__file__).parent / "prompts"
STRATEGY = (PROMPTS / "strategy.md").read_text()
REPLAN = (PROMPTS / "replan.md").read_text()
REVIEW = (PROMPTS / "review.md").read_text()
SYNTHESIS = (PROMPTS / "synthesis.md").read_text()
CHAT = (PROMPTS / "chat.md").read_text()
THAI = re.compile("[฀-๿]")
DONE = object()
PLAN_ERROR = "Could not plan a search for this question. Please rephrase it and try again."


QUICK_SEARCHES = 2


def _history_block(history: list) -> str:
    """Earlier turns as a <history> JSON block; escaping "<" stops the text from closing the block early."""
    if not history:
        return ""
    turns = [{"question": t.question, "answer": t.answer} for t in history]
    return "<history>\n" + json.dumps(turns, ensure_ascii=False, indent=1).replace("<", "\\u003c") + "\n</history>\n\n"


async def _strategy(question: str, settings: Settings, history: list = ()) -> Strategy | None:
    try:
        r = await llm.complete(STRATEGY, f"{_history_block(history)}Question:\n{question}", max_tokens=settings.strategy_max_tokens,
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


def _norm(term: str) -> str:
    return " ".join(term.lower().split())


async def _replan(question: str, thin: list[tuple[str, int]], tried: list[str], settings: Settings,
                  history: list = ()) -> Replan | None:
    """Extra English searches for the thin ones, none already tried. Gets only the question, terms and counts (never
    paper text, which is untrusted). Any failure or nothing new is None: the run goes on without it."""
    user = (f"{_history_block(history)}<searches>\n"
            + json.dumps({"max_searches": settings.replan_max_searches, "thin": [{"term": t, "papers_found": n} for t, n in thin],
                       "already_tried": tried},
                         ensure_ascii=False, indent=1).replace("<", "\\u003c")
            + f"\n</searches>\n\nQuestion:\n{question}")
    try:
        r = await llm.complete(REPLAN, user, max_tokens=settings.strategy_max_tokens, json_mode=True, settings=settings)
        data = json.loads(r.text)
        found = [Search(term=str(s.get("term") or "").strip(), instructions=str(s.get("instructions") or "").strip())
                 for s in data["searches"]]
        reasoning = str(data.get("reasoning") or "")
    except Exception as e:
        log.warning("replan skipped: %r", e)
        return None
    seen = {_norm(t) for t in tried}
    searches = []
    for s in found:
        if s.term and not THAI.search(s.term) and _norm(s.term) not in seen:
            seen.add(_norm(s.term))
            searches.append(s)
    searches = searches[:settings.replan_max_searches]
    return Replan(reasoning=reasoning, thin=[t for t, _ in thin], searches=searches) if searches else None


def _data_block(references: list[Reference], answers: list[BranchAnswer], records: list[DataRecord] = ()) -> str:
    data = {"references": [{"id": r.id, "status": r.status, **r.paper.model_dump(exclude={"abstract"})} for r in references],
            "records": [r.model_dump() for r in records],  # fields are already length-capped by DataRecord
            "findings": [{"search": a.term, "summary": a.content} for a in answers]}
    # JSON keeps the text a string; escaping "<" stops it from closing the block early
    return "<data>\n" + json.dumps(data, ensure_ascii=False, indent=1).replace("<", "\\u003c") + "\n</data>"


def _squash(s: str) -> str:
    return " ".join(s.split())


def _pool(text: str, refs: list[Reference]) -> dict[str, Reference]:
    """References the reviewer sees: cited in the part of the answer that is sent, with an abstract, first 30."""
    cited = {m[1] for m in re.finditer(r"\[(\d+)\]", text[:20000])}
    return dict(list({r.id: r for r in refs if r.id in cited and r.paper.abstract}.items())[:30])


def _trim(text: str, refs: list[Reference]) -> list[Reference]:
    """Abstracts stay only on reviewed references, so a stored answer never carries 100 of them."""
    keep = _pool(text, refs)
    return [r if r.id in keep or not r.paper.abstract else r.model_copy(update={"paper": r.paper.model_copy(update={"abstract": None})})
            for r in refs]


def _exact(quote: str, abstract: str) -> bool:
    """A quote of at least 20 chars that is a substring of the abstract (whitespace collapsed, case-sensitive) and
    starts and ends on word boundaries, so "0% efficiency" is not a quote of "60% efficiency". A combining mark (Thai
    vowel and tone marks) is part of its word, never a boundary: Thai text is only cut at spaces or punctuation."""
    inside = lambda ch: ch.isalnum() or unicodedata.category(ch).startswith("M")  # noqa: E731
    if len(quote) < 20 or len(quote) > 600:
        return False
    i = abstract.find(quote)
    while i >= 0:
        j = i + len(quote)
        if (i == 0 or not inside(abstract[i - 1])) and (j == len(abstract) or not inside(abstract[j])):
            return True
        i = abstract.find(quote, i + 1)
    return False


async def _review(text: str, refs: list[Reference], settings: Settings) -> list[Reference] | None:
    """Check each claim cited to a reference with an abstract. Returns the references with `checks`, or None when there is
    nothing to review or anything fails (the answer then goes out as without review). A quote survives only if _exact;
    otherwise the check becomes no_quote."""
    pool = _pool(text, refs)
    if not pool:
        return None
    data = {"answer": text[:20000],
            "references": [{"id": r.id, "title": r.paper.title, "abstract": r.paper.abstract} for r in pool.values()]}
    user = "<data>\n" + json.dumps(data, ensure_ascii=False, indent=1).replace("<", "\\u003c") + "\n</data>"
    try:
        async with asyncio.timeout(60):
            r = await llm.complete(REVIEW, user, max_tokens=settings.review_max_tokens, json_mode=True, settings=settings)
            raw = json.loads(r.text)["checks"]
        if not isinstance(raw, list):
            return None
    except Exception as e:  # includes TimeoutError
        log.warning("review skipped: %r", e)
        return None
    checks: dict[str, list[Check]] = {}
    total = 0
    for c in raw:
        try:
            ref, support = str(c["ref"]), c["support"]
            if ref not in pool or support not in ("supported", "partial", "unsupported", "no_quote") or len(checks.get(ref, [])) >= 5 or total >= 60:
                continue
            quote = _squash(c["quote"]) if isinstance(c.get("quote"), str) else ""
            if quote and not _exact(quote, _squash(pool[ref].paper.abstract)):
                quote = ""
            if support in ("supported", "partial") and not quote:
                support = "no_quote"
            checks.setdefault(ref, []).append(Check(claim=str(c["claim"]).strip()[:400], support=support, quote=quote or None))
            total += 1
        except Exception:  # one malformed check is dropped, not the rest
            continue
    return [x.model_copy(update={"checks": checks.get(x.id, [])}) for x in refs]


def _has_id(r: Reference) -> bool:
    return bool(r.paper.doi or r.paper.pmid or arxiv_id(r.paper.url))


def _ids(refs: list[Reference], status: str) -> str:
    return "".join(f"[{r.id}]" for r in refs if r.status == status)


async def _plan(question: str, settings: Settings, mode: str, history: list, plan: list | None) -> Strategy | None:
    """The caller's plan as-is (no model call), else the model's; quick mode keeps only the first searches."""
    if plan:
        strategy = Strategy(reasoning="", searches=[Search(term=p.term, instructions=p.instructions) for p in plan])
    elif not (strategy := await _strategy(question, settings, history)):
        return None
    if mode == "quick":
        strategy.searches = strategy.searches[:QUICK_SEARCHES]
    return strategy


async def ask(question: str, runner: BranchRunner, *, settings: Settings, client: httpx.AsyncClient,
              gate: RunGate, mode: str = "deep", history: list = (), plan: list | None = None,
              plan_only: bool = False, memory: list = ()) -> AsyncIterator[Event]:
    """Scope check, then, holding a gate slot: strategy, branches, citation check (via client), synthesis.
    plan_only stops after the strategy, with no gate slot."""
    if mode == "chat":
        async for e in _chat(question, memory, settings, gate):
            yield e
        return
    verdict = await guard("plan_only" if plan_only else mode, question, settings=settings)
    if not verdict.in_scope:
        yield Refused(reason=verdict.reason, code=verdict.code)  # refusals never queue or take a slot
        return
    if plan_only:
        if strategy := await _plan(question, settings, mode, history, plan):
            yield strategy
            yield Complete()
        else:
            yield Error(message=PLAN_ERROR)
        return
    async with aclosing(gate.acquire()) as waits:
        async for position in waits:
            yield Waiting(position=position, eta_seconds=getattr(gate, "eta", lambda _: None)(position))
    try:
        # aclosing: when our consumer goes away, _run's cleanup (killing the bridges) runs now, not at GC
        async with aclosing(_run(question, runner, settings, client, mode, history, plan)) as events:
            async for e in events:
                yield e
    finally:
        gate.release()


async def _run(question: str, runner: BranchRunner, settings: Settings, client: httpx.AsyncClient, mode: str,
               history: list, given: list | None) -> AsyncIterator[Event]:
    plan = await _plan(question, settings, mode, history, given)
    if plan is None:
        yield Error(message=PLAN_ERROR)
        return
    yield plan

    async def branch(queue: asyncio.Queue, s: Search) -> None:
        try:
            async for item in runner.run(s.term, s.instructions):
                await queue.put((s.term, item))
        except Exception as e:  # a runner bug in one branch must not stop the others
            await queue.put((s.term, BranchFailed(term=s.term, reason=type(e).__name__)))

    async def run_all(queue: asyncio.Queue, searches: list[Search]) -> None:
        try:
            # return_exceptions: on cancel, wait for every branch to stop its bridge (without it gather ends at the first one)
            await asyncio.gather(*(branch(queue, s) for s in searches), return_exceptions=True)
        finally:
            queue.put_nowait(DONE)

    references: dict[str, Reference] = {}
    answers: list[BranchAnswer] = []
    failed: list[str] = []
    rejected: set[str] = set()
    unkeyed = 0  # rejections with no identity at all
    per_branch: dict[str, int] = {}
    capped = 0  # papers past max_papers_per_branch
    records: dict[tuple[str, str], DataRecord] = {}
    rec_per_branch: dict[str, int] = {}
    rec_capped = 0
    gated: set[str] = set()  # names of key-gated databases the model tried to use
    rec_invalid: set = set()  # database:id of rejected records, or a unique marker when unidentified
    searches = plan.searches
    tried = [s.term for s in searches]
    extra_rounds = settings.replan_rounds if mode == "deep" else 0
    for round_no in range(extra_rounds + 1):
        queue: asyncio.Queue = asyncio.Queue()
        task = asyncio.create_task(run_all(queue, searches))
        failed_before = len(failed)
        try:
            while (msg := await queue.get()) is not DONE:
                term, item = msg
                if isinstance(item, BranchUsage):  # each branch reports once, so each is added once, whatever the round
                    usage.note(item.prompt_tokens, item.completion_tokens, item.cost_usd, item.cost_status == "estimated")
                elif isinstance(item, BranchFailed):
                    failed.append(term)
                elif isinstance(item, InvalidPaper):
                    if item.key:
                        rejected.add(item.key)
                    else:
                        unkeyed += 1
                elif isinstance(item, BranchAnswer):
                    answers.append(item)  # held back so all sources events come before the answers
                elif isinstance(item, InvalidRecord):
                    if item.code == "needs_key":
                        if (db := DATA_SOURCES.get((item.key or "").split(":", 1)[0])) is not None:
                            gated.add(db.name)
                    else:
                        rec_invalid.add(item.key or object())
                elif isinstance(item, DataRecord):
                    if (item.database, item.id) in records:  # the same entry again is one record and takes no slot
                        continue
                    if (n := rec_per_branch.get(term, 0)) >= settings.max_records_per_branch:
                        rec_capped += 1
                    else:
                        rec_per_branch[term] = n + 1
                        records[item.database, item.id] = item
                        yield Records(term=term, records=[item])
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
        if round_no == extra_rounds:
            break
        # thin: the branch failed, or reported fewer papers than the minimum (duplicates of another search's papers count)
        thin = [(s.term, per_branch.get(s.term, 0)) for s in searches
                if per_branch.get(s.term, 0) < settings.replan_min_papers or s.term in failed[failed_before:]]
        thin = list(dict(thin).items())
        # a cancel during this call finds no branch alive: the finally above already stopped them
        if not thin or not (replan := await _replan(question, thin, tried, settings, history)):
            break
        yield replan
        searches = replan.searches
        tried += [s.term for s in searches]

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
    final_records = list(records.values())[:100]  # the store rejects an answer with more than 100 records (store.Answer)
    note = "".join(f'\n\nNote: the search for "{t}" failed, so this answer does not cover it.' for t in failed)
    if dropped:
        note += f"\n\nNote: {dropped} paper(s) were left out because their metadata was invalid."
    rec_dropped = sum(1 for k in rec_invalid if not isinstance(k, str) or tuple(k.split(":", 1)) not in records)  # a corrected retry is not a drop
    if rec_dropped:
        note += f"\n\nNote: {rec_dropped} database record(s) were left out because their data was invalid."
    if gated:
        names = ", ".join(sorted(gated))
        note += f"\n\nNote: {names} {'was' if len(gated) == 1 else 'were'} skipped because {'it needs' if len(gated) == 1 else 'they need'} an API key that is not configured."
    if rec_capped:
        note += (f"\n\nNote: {rec_capped} database record(s) were left out because a search reported more than "
                 f"{settings.max_records_per_branch}.")
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
                                  + note, references=_trim("", refs), records=final_records,
                          usage=usage.snapshot())
        yield Complete()
        return
    user = (_history_block(history) + _data_block(refs, answers, final_records)
            + "".join(f'\nThe search for "{t}" failed and returned no findings.' for t in failed)
            + f"\n\nQuestion:\n{question}")
    try:
        r = await llm.complete(SYNTHESIS, user, max_tokens=settings.synthesis_max_tokens, settings=settings)
    except Exception:
        yield Error(message="Could not write the answer. Please try again.")
        return
    text = r.text.strip()
    if settings.review_enabled and mode in ("deep", "quick") and (reviewed := await _review(text, refs, settings)):
        refs = reviewed
        if ids := "".join(f"[{x.id}]" for x in refs if any(c.support == "unsupported" for c in x.checks)):
            note += (f"\n\nNote: the abstract of reference(s) {ids} does not state the claim it is cited for "
                     "(the reviewer checks abstracts only). Check the full paper before relying on those claims.")
    yield FinalAnswer(content=text + note, references=_trim(text, refs), records=final_records, usage=usage.snapshot())
    yield Complete()


# --- "chat" mode: answer from the session's own earlier turns, no search --------------------------------------------
MARKER = re.compile(r"\[M(\d+)\]")


def _memory_block(memory: list) -> tuple[str, dict[str, Reference]]:
    """<memory> JSON block plus its references by global id. Each turn's own ids ("[1]") are rewritten to one global
    scheme ("[M1]", a paper shared by turns keeps one id); markers a turn cannot back are dropped."""
    refs: dict[str, Reference] = {}
    by_key: dict[str, Reference] = {}
    turns = []
    for t in memory:
        local: dict[str, str] = {}
        for r in t.references:
            try:
                p = Paper(title=r.title, authors=r.authors, year=r.year, doi=r.doi, pmid=r.pmid, url=r.url)
            except ValidationError:
                continue  # a reference the browser mangled is not citable
            ref = by_key.setdefault(paper_key(p.doi, p.pmid, p.title, p.url),
                                    Reference(id=f"M{len(by_key) + 1}", paper=p, status=r.status))
            refs[ref.id] = ref
            local[r.id] = ref.id
        text = re.sub(r"\[(\d+)\]", lambda m: f"[{local[m[1]]}]" if m[1] in local else "", t.answer)
        turns.append({"question": t.question, "answer": text})
    data = {"references": [{"id": r.id, "status": r.status, **r.paper.model_dump()} for r in refs.values()],
            "earlier_turns": turns}
    return "<memory>\n" + json.dumps(data, ensure_ascii=False, indent=1).replace("<", "\\u003c") + "\n</memory>", refs


def _cited(text: str, refs: dict[str, Reference]) -> tuple[str, list[Reference]]:
    """Drop [Mn] markers not in the supplied set; renumber the rest 1.. by first use. Returns text and cited refs."""
    order: dict[str, Reference] = {}

    def sub(m: re.Match) -> str:
        if (r := refs.get("M" + m[1])) is None:
            return ""
        n = order.setdefault(r.id, Reference(id=str(len(order) + 1), paper=r.paper, status=r.status)).id
        return f"[{n}]"
    return MARKER.sub(sub, text), list(order.values())


async def _chat(question: str, memory: list, settings: Settings, gate: RunGate) -> AsyncIterator[Event]:
    """One model call over the browser-supplied memory: no scope model, no strategy, no branches."""
    verdict = await guard("chat", question, settings=settings, context={"memory": len(memory)})  # cheap rules only
    if not verdict.in_scope:
        yield Refused(reason=verdict.reason, code=verdict.code)
        return
    async with aclosing(gate.acquire()) as waits:
        async for position in waits:
            yield Waiting(position=position, eta_seconds=getattr(gate, "eta", lambda _: None)(position))
    try:
        block, refs = _memory_block(memory)
        try:
            r = await llm.complete(CHAT, f"{block}\n\nQuestion:\n{question}", max_tokens=settings.synthesis_max_tokens,
                                   settings=settings)
        except Exception:
            yield Error(message="Could not write the answer. Please try again.")
            return
        text, cited = _cited(r.text.strip(), refs)
        yield FinalAnswer(content=text, references=cited)
        yield Complete()
    finally:
        gate.release()

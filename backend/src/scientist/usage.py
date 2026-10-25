"""Usage recording: one usage_events row per ask/analyze/chat run, best effort (a failed write never touches the run)."""
import asyncio
import logging
import time
from collections import defaultdict
from collections.abc import AsyncIterator
from contextvars import ContextVar

import anyio
import sqlalchemy as sa

from scientist import models as m
from scientist.events import AnalysisResult, AnalysisStep, BranchAnswer, Complete, Error, Event, FinalAnswer, Refused, Sources, Strategy, Waiting

log = logging.getLogger(__name__)
PENDING: set[asyncio.Task] = set()
CURRENT: ContextVar["Acc | None"] = ContextVar("usage", default=None)
END_LABEL = {Waiting: "queue", Strategy: "strategy", Sources: "search", BranchAnswer: "search",
             FinalAnswer: "synthesis", Refused: "scope", AnalysisStep: "setup", AnalysisResult: "finish"}


class Acc:
    def __init__(self) -> None:
        self.calls, self.prompt, self.completion, self.cost = 0, 0, 0, None
        self.papers = 0


def note(prompt_tokens: int, completion_tokens: int, cost: float | None) -> None:
    """Called by llm after each successful model call; a no-op outside a tracked run."""
    if (a := CURRENT.get()) is not None:
        a.calls += 1
        a.prompt += prompt_tokens
        a.completion += completion_tokens
        if cost is not None:
            a.cost = (a.cost or 0) + cost


async def track(events: AsyncIterator[Event], *, mode: str, db) -> AsyncIterator[Event]:
    """Pass events through unchanged while timing phases and counting model calls; writes the row at the end."""
    acc, phases, ok = Acc(), defaultdict(float), False
    last, current = time.monotonic(), None  # current: a phase an AnalysisStep announced and is still running
    it = events.__aiter__()
    try:
        while True:
            tok = CURRENT.set(acc)  # per step: the consumer may call us from a different task each time
            try:
                e = await anext(it)
            except StopAsyncIteration:
                break
            finally:
                CURRENT.reset(tok)
            now = time.monotonic()
            phases[current or END_LABEL.get(type(e), "other")] += now - last
            last, current = now, (e.step if isinstance(e, AnalysisStep) else None)
            if isinstance(e, Sources):
                acc.papers += len(e.papers)
            if isinstance(e, (Complete, Refused, AnalysisResult)):
                ok = True
            elif isinstance(e, Error):
                ok = False
            yield e
    finally:
        # background task: a slow or down database must not hold the stream open; also runs after a client disconnect
        t = asyncio.create_task(record(db, mode=mode, phases=phases, acc=acc, ok=ok))
        PENDING.add(t)
        t.add_done_callback(PENDING.discard)
        with anyio.CancelScope(shield=True):
            if hasattr(it, "aclose"):
                await it.aclose()


async def record(db, *, mode: str, phases: dict, acc: Acc, ok: bool) -> None:
    try:
        async with db.session() as s, s.begin():
            await asyncio.wait_for(s.execute(sa.insert(m.usage_events).values(
                mode=mode, phase_seconds={k: round(v, 3) for k, v in phases.items()}, llm_calls=acc.calls,
                prompt_tokens=acc.prompt if acc.calls else None, completion_tokens=acc.completion if acc.calls else None,
                cost_usd=acc.cost, papers_found=acc.papers or None, ok=ok)), 5)
    except Exception as e:
        log.warning("usage row not written: %s", type(e).__name__)


SUMMARY = sa.text("""
with u as (select mode, ok, prompt_tokens, completion_tokens, cost_usd,
  (select coalesce(sum(v::float8), 0) from jsonb_each_text(coalesce(phase_seconds, '{}'::jsonb)) e(k, v)) secs
  from usage_events where at >= now() - make_interval(0, 0, 0, :days))
select mode, count(*) n, percentile_cont(0.5) within group (order by secs) p50,
  percentile_cont(0.95) within group (order by secs) p95, avg(prompt_tokens) pt, avg(completion_tokens) ct,
  avg(cost_usd) cost, avg(ok::int) ok_rate from u group by mode order by mode""")


async def summary(db, days: int) -> dict:
    async with db.session() as s:
        rows = (await s.execute(SUMMARY, {"days": days})).all()
    f = lambda v, n=3: None if v is None else round(float(v), n)  # noqa: E731
    return {"days": days, "modes": {r.mode: {"count": r.n, "p50_seconds": f(r.p50), "p95_seconds": f(r.p95),
                                             "avg_prompt_tokens": f(r.pt, 1), "avg_completion_tokens": f(r.ct, 1),
                                             "avg_cost_usd": f(r.cost, 6), "ok_rate": f(r.ok_rate)} for r in rows}}


async def drain() -> None:
    """Wait for usage rows still being written (tests, shutdown)."""
    if PENDING:
        await asyncio.gather(*PENDING, return_exceptions=True)

"""POST /v1/async/ask: one research question in, a server-sent event stream out (see events.py)."""
import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import suppress
from typing import Literal

import anyio
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from scientist.config import get_settings
from scientist.events import Error, Event, to_sse
from scientist.pipeline import THAI, ask

log = logging.getLogger(__name__)
router = APIRouter()
HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


class HistoryTurn(BaseModel):
    question: str
    answer: str


class PlanSearch(BaseModel):
    term: str
    instructions: str = ""


class AskRequest(BaseModel):
    question: str
    mode: Literal["deep", "quick"] = "deep"
    history: list[HistoryTurn] = []
    plan: list[PlanSearch] | None = None
    plan_only: bool = False

    @field_validator("question")
    @classmethod
    def _length(cls, v: str) -> str:  # 422 before any model call
        v = v.strip()
        if not v:
            raise ValueError("question is empty")
        if len(v) > (limit := get_settings().max_question_chars):
            raise ValueError(f"question is longer than {limit} characters")
        return v

    @field_validator("history")
    @classmethod
    def _clamp_history(cls, v: list[HistoryTurn]) -> list[HistoryTurn]:  # clamp, never 422
        return [HistoryTurn(question=t.question[:2000], answer=t.answer[:2000]) for t in v[-3:]]

    @field_validator("plan")
    @classmethod
    def _clean_plan(cls, v: list[PlanSearch] | None) -> list[PlanSearch] | None:
        if v is None:
            return None
        kept = [PlanSearch(term=t, instructions=p.instructions.strip()) for p in v
                if (t := p.term.strip()) and not THAI.search(t)]
        return kept[:get_settings().max_branches] or None


async def _sse(events: AsyncIterator[Event], ping: float) -> AsyncIterator[str]:
    """The run advances in its own task so a `: ping` comment can go out while it waits (queue, slow branch)."""
    nxt = None
    try:
        while True:
            nxt = nxt or asyncio.ensure_future(anext(events))
            if not (await asyncio.wait({nxt}, timeout=ping))[0]:
                yield ": ping\n\n"
                continue
            try:
                event = nxt.result()
            except StopAsyncIteration:
                return
            except Exception:
                log.exception("ask run failed")
                yield to_sse(Error(message="Something went wrong. Please try again."))
                return
            nxt = None
            yield to_sse(event)
    finally:
        # ponytail: disconnect detection relies on StreamingResponse's listen-for-disconnect, which only runs while the
        # server's ASGI spec version is below 2.4 (uvicorn reports 2.3). Ceiling: a server on 2.4+ stops cancelling
        # this generator; then poll `request.is_disconnected()` in the loop or pin uvicorn.
        # client gone: stop the run and wait for its cleanup (bridges killed, gate slot freed)
        with anyio.CancelScope(shield=True):
            if nxt:
                nxt.cancel()
                with suppress(asyncio.CancelledError, Exception):
                    await nxt
            await events.aclose()


@router.post("/v1/async/ask")
async def ask_route(body: AskRequest, request: Request) -> StreamingResponse:
    st = request.app.state
    events = ask(body.question, st.runner, settings=st.settings, client=st.client, gate=st.gate, mode=body.mode,
                 history=body.history, plan=body.plan, plan_only=body.plan_only)
    return StreamingResponse(_sse(events, st.settings.sse_ping_seconds), media_type="text/event-stream",
                             headers=HEADERS)

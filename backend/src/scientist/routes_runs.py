"""/v1/runs: submit a run, follow it (SSE with replay), cancel it, see how busy the server is. Needs the database."""
import json
import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import Field

from scientist.routes_ask import HEADERS, AskRequest
from scientist.routes_store import run as guarded, write_guard
from scientist.runqueue import Rejected
from scientist.runs import RunService
from scientist.store import UUID_RE

router = APIRouter(prefix="/v1/runs")
Uid = Annotated[str, Path(pattern=UUID_RE)]


class RunIn(AskRequest):
    """AskRequest's rules for both kinds (mode is ignored for analyze); plan_only is not a run."""
    session_id: str = Field(pattern=UUID_RE)
    turn_id: str = Field(pattern=UUID_RE)
    kind: Literal["ask", "analyze"]
    file_id: str | None = Field(None, max_length=64)
    file_name: str | None = Field(None, max_length=120)


def service(request: Request) -> RunService:
    if (svc := getattr(request.app.state, "runs", None)) is None:
        raise HTTPException(503, "runs need the shared store")
    return svc


def client_id(x_client_id: Annotated[str | None, Header()] = None) -> str:
    if not x_client_id or not re.fullmatch(UUID_RE, x_client_id):
        raise HTTPException(400, "X-Client-Id must be a UUID v4")
    return x_client_id


@router.get("/status")
async def status(svc: RunService = Depends(service)):
    return svc.queue.status()


@router.post("", status_code=202, dependencies=[Depends(service)])
async def submit(body: RunIn, request: Request, cid: str = Depends(client_id), svc: RunService = Depends(service)):
    try:
        write_guard(request, svc.data)  # JSON content type, origin, per-IP write rate
    except HTTPException as e:
        if e.status_code == 429:
            return JSONResponse({"detail": e.detail, "code": "rate_limited"}, status_code=429)
        raise
    if body.plan_only:
        raise HTTPException(422, "plan_only is not a run; use /v1/async/ask")
    try:
        return await guarded(svc.submit(body, cid))
    except Rejected as e:
        return JSONResponse({"detail": e.message, "code": e.code}, status_code=429)


@router.get("/{rid}")
async def get_run(rid: Uid, x_client_id: Annotated[str | None, Header()] = None, svc: RunService = Depends(service)):
    if (row := await svc.get(rid)) is None:
        raise HTTPException(404, "run not found")
    return svc.view(row, x_client_id)


@router.post("/{rid}/cancel")
async def cancel(rid: Uid, cid: str = Depends(client_id), svc: RunService = Depends(service)):
    try:
        row = await svc.cancel(rid, cid)
    except PermissionError:
        raise HTTPException(403, "only the browser that started this run can cancel it")
    if row is None:
        raise HTTPException(404, "run not found")
    return svc.view(row, cid)


@router.get("/{rid}/events")
async def events(rid: Uid, request: Request, after: Annotated[int | None, Query(ge=0)] = None,
                 last_event_id: Annotated[str | None, Header()] = None, svc: RunService = Depends(service)):
    if (await svc.get(rid)) is None:
        raise HTTPException(404, "run not found")
    start = after if after is not None else int(last_event_id) if last_event_id and last_event_id.isdigit() else 0

    async def gen():
        async for seq, ev in svc.events(rid, start, request.app.state.settings.sse_ping_seconds):
            if ev is None:
                yield ": ping\n\n"
            else:  # seq None: the live queue position, not a stored event, so no id (a resume must not skip past it)
                yield (f"id: {seq}\n" if seq is not None else "") + f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers=HEADERS)

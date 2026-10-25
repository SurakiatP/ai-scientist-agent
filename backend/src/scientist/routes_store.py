"""/v1/store/*: the shared dataset (no login), /v1/usage/summary. Needs DATABASE_URL, else 503 "database not configured"."""
import asyncio
import json
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ValidationError

from scientist import usage
from scientist.routes_ask import HEADERS
from scientist.store import (FILE_RE, UUID_RE, Busy, Conflict, FileIn, Gone, Invalid, NotFound, ProjectIn, SessionIn, Store,
                             TooMany, TurnIn)

router = APIRouter(prefix="/v1")
Uid = Annotated[str, Path(pattern=UUID_RE)]
Fid = Annotated[str, Path(pattern=FILE_RE)]


def data(request: Request) -> Store:
    if (st := getattr(request.app.state, "data", None)) is None:
        raise HTTPException(503, "database not configured")
    return st


def require_json(request: Request) -> None:
    """CSRF guard: a cross-site page can only send "simple" requests (text/plain, form types) without a preflight."""
    if not request.headers.get("content-type", "").lower().startswith("application/json"):
        raise HTTPException(415, "Content-Type must be application/json")
    allowed = getattr(request.app.state.settings, "allowed_origins", [])
    if allowed and (o := request.headers.get("origin")) and o not in allowed:
        raise HTTPException(403, "origin not allowed")


def write_guard(request: Request, st: Store = Depends(data)) -> None:
    """Per-client-IP sliding minute (behind a proxy, set FORWARDED_ALLOW_IPS so the real client IP is seen)."""
    if request.method != "DELETE":  # DELETE always preflights; the rest must declare JSON, even body-less POSTs
        require_json(request)
    cap = st.settings.store_write_rate_per_min
    if not cap:
        return
    now, q = time.monotonic(), st.writes[request.client.host if request.client else "?"]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= cap:
        raise HTTPException(429, "too many writes; slow down")
    q.append(now)
    if len(st.writes) > 10_000:  # forget idle clients
        for k in [k for k, v in st.writes.items() if not v or now - v[-1] > 60]:
            del st.writes[k]


async def read_body(request: Request, limit: int):
    if (cl := request.headers.get("content-length")) and cl.isdigit() and int(cl) > limit:
        raise HTTPException(413, "request body too large")
    buf = bytearray()
    async for chunk in request.stream():
        buf += chunk
        if len(buf) > limit:
            raise HTTPException(413, "request body too large")
    try:
        return json.loads(buf)
    except (ValueError, RecursionError):
        raise HTTPException(422, "body is not valid JSON") from None


async def parse[T: BaseModel](request: Request, model: type[T], st: Store) -> T:
    raw = await read_body(request, st.settings.store_max_body_bytes)
    try:
        return model.model_validate(raw)
    except ValidationError as e:
        raise HTTPException(422, e.errors(include_url=False, include_context=False, include_input=False)) from None


async def run(coro):
    try:
        return await coro
    except NotFound as e:
        raise HTTPException(404, f"{e} not found") from None
    except Invalid as e:
        raise HTTPException(422, str(e)) from None
    except Gone as e:
        raise HTTPException(410, str(e)) from None
    except TooMany as e:
        raise HTTPException(409, str(e)) from None
    except Conflict as e:
        return JSONResponse({"detail": str(e), "current": jsonable_encoder(e.current)}, status_code=409)


W = [Depends(write_guard)]


@router.get("/store/snapshot")
async def snapshot(limit_sessions: Annotated[int, Query(ge=1)] = 200, st: Store = Depends(data)):
    return await st.snapshot(limit_sessions)


@router.put("/store/projects/{pid}", dependencies=W)
async def put_project(pid: Uid, request: Request, st: Store = Depends(data)):
    b = await parse(request, ProjectIn, st)
    return await run(st.upsert("project", pid, {"name": b.name.strip()}, b.version))


@router.delete("/store/projects/{pid}", dependencies=W)
async def del_project(pid: Uid, permanent: bool = False, st: Store = Depends(data)):
    return await run(st.delete_permanent("project", pid) if permanent else st.soft_delete("project", pid))


@router.post("/store/projects/{pid}/restore", dependencies=W)
async def restore_project(pid: Uid, st: Store = Depends(data)):
    return await run(st.restore("project", pid))


@router.put("/store/sessions/{sid}", dependencies=W)
async def put_session(sid: Uid, request: Request, st: Store = Depends(data)):
    b = await parse(request, SessionIn, st)
    return await run(st.upsert("session", sid, {"title": b.title, "project_id": b.project_id}, b.version))


@router.delete("/store/sessions/{sid}", dependencies=W)
async def del_session(sid: Uid, permanent: bool = False, st: Store = Depends(data)):
    return await run(st.delete_permanent("session", sid) if permanent else st.soft_delete("session", sid))


@router.post("/store/sessions/{sid}/restore", dependencies=W)
async def restore_session(sid: Uid, st: Store = Depends(data)):
    return await run(st.restore("session", sid))


@router.put("/store/sessions/{sid}/turns/{tid}", dependencies=W)
async def put_turn(sid: Uid, tid: Uid, request: Request, st: Store = Depends(data)):
    return await run(st.put_turn(sid, tid, await parse(request, TurnIn, st)))


@router.delete("/store/sessions/{sid}/turns/from/{idx}", dependencies=W)
async def truncate_turns(sid: Uid, idx: Annotated[int, Path(ge=0, le=100_000)], st: Store = Depends(data)):
    return await run(st.truncate_turns(sid, idx))


@router.put("/store/files/{fid}", dependencies=W)
async def put_file(fid: Fid, request: Request, st: Store = Depends(data)):
    b = await parse(request, FileIn, st)
    return await run(st.upsert("file", fid, {"name": b.name.strip(), "size": b.size, "kind": b.kind, "project_id": b.project_id}, b.version))


@router.delete("/store/files/{fid}", dependencies=W)
async def del_file(fid: Fid, permanent: bool = False, st: Store = Depends(data)):
    return await run(st.delete_permanent("file", fid) if permanent else st.soft_delete("file", fid))


@router.post("/store/files/{fid}/restore", dependencies=W)
async def restore_file(fid: Fid, st: Store = Depends(data)):
    return await run(st.restore("file", fid))


@router.get("/store/trash")
async def trash(st: Store = Depends(data)):
    return await st.trash()


@router.post("/store/trash/purge", dependencies=W)
async def purge(st: Store = Depends(data)):
    return await st.purge()


@router.post("/store/import", dependencies=W)
async def import_old(request: Request, st: Store = Depends(data)):
    raw = await read_body(request, st.settings.import_max_bytes)
    if not isinstance(raw, dict):
        raise HTTPException(422, "body must be a JSON object")
    return await st.import_all(raw)


@router.get("/store/events")
async def events(request: Request, st: Store = Depends(data)):
    ping = st.settings.sse_ping_seconds
    cm = st.bus.subscribe()
    try:
        q = await cm.__aenter__()
    except Busy:
        raise HTTPException(429, "too many listeners") from None

    async def gen():
        try:
            yield ": ok\n\n"
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), ping)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                yield f"data: {json.dumps(msg)}\n\n"
        finally:
            await cm.__aexit__(None, None, None)
    return StreamingResponse(gen(), media_type="text/event-stream", headers=HEADERS)


@router.get("/usage/summary")
async def usage_summary(days: Annotated[int, Query(ge=1, le=90)] = 7, st: Store = Depends(data)):
    return await usage.summary(st.db, days)

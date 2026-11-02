"""/v1/api: the public research API for programs (API key, JSON only). It drives the same RunService as the browser, with
its own client id per key (`key:<id>`), so keys and browsers cannot cancel or crowd out each other. Runs live in the shared
store (project "API"); a key reads, follows and cancels only the runs it started."""
import json
import re
import uuid
from contextlib import aclosing, suppress
from datetime import UTC, datetime
from typing import Annotated, Literal

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.dialects.postgresql import insert as pg_insert

from scientist import models as m, routes_runs
from scientist.apikeys import ApiKey, require_key
from scientist.bibliography import to_bibtex, to_ris
from scientist.events import Error, Refused, Strategy
from scientist.packs import PACKS
from scientist.pipeline import ask
from scientist.routes_ask import AskRequest, PlanSearch
from scientist.routes_runs import RunIn, service
from scientist.routes_store import run as guarded
from scientist.runqueue import Rejected
from scientist.runs import RunService
from scientist.store import UUID_RE, _row
from scientist.usage import track

PREFIX = "/v1/api"
API_PROJECT = uuid.UUID("5c1e2b64-0a7d-4e0b-9d54-a91b6f0d4a10")  # the one project every API session goes into
Rid = Annotated[str, Path(pattern=UUID_RE)]


class ErrorOut(BaseModel):
    detail: str
    code: str | None = Field(None, description="Machine-readable reason when there is one (client_busy, queue_full, busy, no_plan, or a refusal code).")


def errs(**codes: str) -> dict:
    return {int(c[1:]): {"model": ErrorOut, "description": d} for c, d in codes.items()}


UNAUTH = {401: {"description": "Missing, malformed, unknown or revoked API key (always the same body)"}}
GONE = errs(c404="No such API run (browser runs are not part of this API)")

router = APIRouter(prefix=PREFIX, tags=["public"], dependencies=[Depends(require_key)], responses=UNAUTH)
spec_router = APIRouter(prefix=PREFIX)  # the description of the API is public; it is not part of the API itself


class ResearchIn(BaseModel):
    question: str = Field(description="The research question (same length limit as the app).")
    mode: Literal["deep", "quick"] = "deep"
    pack: str | None = Field(None, description="A pack id from GET /packs; omit for General.")
    plan: list[PlanSearch] | None = Field(None, description="Searches to run instead of letting the model plan them (see POST /plan).")
    doc_ids: list[str] | None = Field(None, max_length=5, description="Ids of uploaded PDFs; the answer then comes from those documents (mode becomes docs).")
    task: Literal["answer", "reproduce"] = Field("answer", description="With doc_ids: \"reproduce\" returns a plan to reproduce the attached paper instead of an answer.")


class PlanIn(BaseModel):
    question: str
    mode: Literal["deep", "quick"] = "deep"
    pack: str | None = None


class SearchOut(BaseModel):
    term: str
    instructions: str


class PlanOut(BaseModel):
    reasoning: str
    searches: list[SearchOut]


class Accepted(BaseModel):
    run_id: str
    session_id: str
    turn_id: str
    status: str


class PackOut(BaseModel):
    id: str
    th: str
    en: str


class Progress(BaseModel):
    phase: str | None
    searches: list[SearchOut]
    replans: int


class RunOut(BaseModel):
    run_id: str
    status: Literal["queued", "running", "done", "refused", "error", "stopped", "interrupted"]
    kind: str
    mode: str | None
    pack: str | None
    created_at: datetime
    finished_at: datetime | None
    error: str | None = Field(description="Why a run ended in error or refused; null otherwise.")
    code: str | None = Field(None, description="Machine-readable refusal or error code of the run (e.g. a refusal code, failed, cut_off, stopped); null otherwise.")
    answer: dict | None = Field(description="{content, references, records, doc_refs, empty_files, usage}; set once the run is done.")
    progress: Progress


def check_rid(rid: str) -> str:
    if not re.fullmatch(UUID_RE, rid):
        raise HTTPException(404, "run not found")
    return rid


def valid(model, **kw):
    """The app's own request model decides (limits, pack, plan clean-up, docs ids); its errors are a 422 like any other."""
    try:
        return model(**kw)
    except ValidationError as e:
        raise RequestValidationError(e.errors(include_url=False, include_context=False)) from None


def iso(d: datetime) -> str:  # as JS toISOString
    return d.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


async def own(svc: RunService, rid: str, key: ApiKey) -> dict:
    """The run row if it was created with this API key; browser runs and other keys' runs are not part of its API."""
    row = await svc.get(rid)
    if row is None or row["client_id"] != key.client_id:
        raise HTTPException(404, "run not found")
    return row


async def turn_of(svc: RunService, row: dict) -> dict | None:
    async with svc.data.db.session() as s:
        t = (await s.execute(sa.select(m.turns).where(m.turns.c.id == row["turn_id"]))).first()
    return _row(t) if t else None


def shape(row: dict, turn: dict | None) -> dict:
    p = (turn or {}).get("progress") or {}
    a = (turn or {}).get("answer")
    return {"run_id": row["id"], "status": row["status"], "kind": row["kind"], "mode": row["mode"], "pack": (turn or {}).get("pack"),
            "created_at": row["created_at"], "finished_at": row["finished_at"],
            "error": row["error"] or (turn or {}).get("refused"), "code": p.get("_code") or p.get("_err"),
            "answer": None if not a else {"content": a.get("content", ""), "references": a.get("references", []), "records": a.get("records", []),
                                          "doc_refs": a.get("doc_refs", []), "empty_files": a.get("empty_files", []), "usage": a.get("usage")},
            "progress": {"phase": p.get("phase"), "searches": p.get("searches", []), "replans": len(p.get("replans", []))}}


async def api_session(svc: RunService, title: str) -> str:
    """A new session in the project "API", created on first use (and brought back if a user trashed it)."""
    ins = pg_insert(m.projects).values(id=str(API_PROJECT), name="API")
    async with svc.data.tx() as s:
        r = (await s.execute(ins.on_conflict_do_update(
            index_elements=["id"], where=m.projects.c.deleted_at.is_not(None),
            set_={"deleted_at": None, "version": m.projects.c.version + 1, "updated_at": sa.func.now()}).returning(m.projects))).first()
        if r:
            await svc.data._changed(s, "project", _row(r))
    sid = str(uuid.uuid4())
    await svc.data.upsert("session", sid, {"title": title[:200], "project_id": str(API_PROJECT)}, None)
    return sid


def settled(out):
    """guarded() turns a Conflict into a 409 response instead of raising; here it is an error like the others."""
    if isinstance(out, Response):
        raise HTTPException(out.status_code, json.loads(out.body)["detail"])
    return out


async def start_run(svc: RunService, key: ApiKey, body: ResearchIn) -> dict:
    """Starts a run for a key (REST and MCP). Raises Rejected when the key's caps are full."""
    run_in = valid(RunIn, session_id=str(uuid.uuid4()), turn_id=str(uuid.uuid4()), kind="ask", question=body.question,
                   mode="docs" if body.doc_ids else body.mode, doc_ids=body.doc_ids or [], docs_task=body.task, pack=body.pack, plan=body.plan)
    await svc.queue.admit(key.client_id)  # refuse before a session is created
    sid = settled(await guarded(api_session(svc, run_in.question)))
    run_in.session_id = sid
    try:
        out = settled(await guarded(svc.submit(run_in, key.client_id)))
    except BaseException:
        with suppress(Exception):  # a refused submit leaves no empty session behind; the original error is what surfaces
            await svc.data.soft_delete("session", sid)
            await svc.data.delete_permanent("session", sid)
        raise
    return {"run_id": out["run"]["id"], "session_id": sid, "turn_id": run_in.turn_id, "status": out["run"]["status"]}


class PlanError(Exception):
    def __init__(self, status: int, detail: str, code: str):
        self.status, self.detail, self.code = status, detail, code


async def make_plan(st, body: PlanIn) -> dict:
    """The planned searches for a question (REST and MCP); raises PlanError (422 refused, 429 busy, 502 no plan)."""
    q = valid(AskRequest, question=body.question, mode=body.mode, pack=body.pack, plan_only=True)
    if st.gate.free == 0 and len(st.gate.queue) >= st.settings.analyze_max_queue:  # the browser plan_only path's bound
        raise PlanError(429, "too many requests queued; try again shortly", "busy")
    events = track(ask(q.question, st.runner, settings=st.settings, client=st.client, gate=st.gate, mode=q.mode, plan_only=True,
                       pack=q.pack), mode="plan", db=st.db)
    message = "no plan was produced"
    async with aclosing(events) as evs:
        async for e in evs:
            if isinstance(e, Strategy):
                return {"reasoning": e.reasoning, "searches": [s.model_dump() for s in e.searches]}
            if isinstance(e, Refused):
                raise PlanError(422, e.reason, e.code)
            if isinstance(e, Error):
                message = e.message
                break
    raise PlanError(502, message, "no_plan")


@router.post("/research", status_code=202, response_model=Accepted, summary="Start a research run",
             responses=errs(c429="client_busy / queue_full / rate limit"))
async def research(body: ResearchIn, key: ApiKey = Depends(require_key), svc: RunService = Depends(service)):
    try:
        return await start_run(svc, key, body)
    except Rejected as e:
        return JSONResponse({"detail": e.message, "code": e.code}, status_code=429)


@router.post("/plan", response_model=PlanOut, summary="Plan the searches for a question (no run is started)",
             responses=errs(c422="The question was refused (code says why) or the body is invalid", c429="The server is busy (code busy) or the rate limit is hit",
                            c502="No plan could be made (code no_plan)"))
async def plan(body: PlanIn, request: Request, svc: RunService = Depends(service)):
    try:
        return await make_plan(request.app.state, body)
    except PlanError as e:
        return JSONResponse({"detail": e.detail, "code": e.code}, status_code=e.status)


@router.get("/packs", response_model=list[PackOut], summary="The research packs")
async def packs():
    return [{"id": k, "th": p.name_th, "en": p.name_en} for k, p in PACKS.items()]


async def run_shape(svc: RunService, rid: str, key: ApiKey) -> dict:
    row = await own(svc, rid, key)
    return shape(row, await turn_of(svc, row))


async def cancel_run(svc: RunService, rid: str, key: ApiKey) -> dict:
    await own(svc, rid, key)  # 404 unless this key started it
    row = await svc.cancel(rid, key.client_id)
    return shape(row, await turn_of(svc, row))


@router.get("/runs/{run_id}", response_model=RunOut, summary="Status, progress and the answer of a run", responses=GONE)
async def get_run(run_id: Rid, key: ApiKey = Depends(require_key), svc: RunService = Depends(service)):
    return await run_shape(svc, run_id, key)


@router.get("/runs/{run_id}/events", summary="Server-sent events of a run (resume with Last-Event-ID or ?after=)",
            responses={200: {"content": {"text/event-stream": {}}}, **GONE})
async def events(run_id: Rid, request: Request, after: Annotated[int | None, Query(ge=0)] = None,
                 last_event_id: Annotated[str | None, Header()] = None, key: ApiKey = Depends(require_key),
                 svc: RunService = Depends(service)):
    await own(svc, run_id, key)
    return await routes_runs.events(run_id, request, after, last_event_id, svc)


@router.post("/runs/{run_id}/cancel", response_model=RunOut, summary="Stop a run (only the key that started it)",
             responses=GONE)
async def cancel(run_id: Rid, key: ApiKey = Depends(require_key), svc: RunService = Depends(service)):
    return await cancel_run(svc, run_id, key)


def provenance_file(turn: dict, answer: dict) -> dict:
    """The same file as the app's download (frontend/src/lib/provenance.ts)."""
    return {"format": "ai-scientist-provenance", "version": 1, "exported_at": iso(datetime.now(UTC)),
            "turn": {"id": str(turn["id"]), "question": turn["question"], "mode": turn["mode"], "created_at": iso(turn["created_at"])},
            "answer": {"content": answer.get("content", ""),
                       "references": [{"id": r["id"], "title": (p := r["paper"])["title"], "authors": p.get("authors", []), "year": p.get("year"),
                                       "doi": p.get("doi"), "pmid": p.get("pmid"), "url": p["url"], "source": p.get("source"),
                                       "status": r["status"], "checks": r.get("checks", [])} for r in answer.get("references", [])],
                       "records": answer.get("records", [])},
            "analysis": None, "provenance": answer["provenance"]}


async def artifact_of(svc: RunService, rid: str, kind: str, key: ApiKey) -> dict | str:
    """The provenance file (dict) or the bibtex / ris text of a finished run (REST and MCP)."""
    row = await own(svc, rid, key)
    if row["status"] in ("queued", "running"):
        raise HTTPException(409, "the run has not finished")
    turn = await turn_of(svc, row)
    a = (turn or {}).get("answer")
    if not a or (kind == "provenance" and not a.get("provenance")):
        raise HTTPException(404, "this run has no such artifact")
    if kind == "provenance":
        return provenance_file(turn, a)
    refs = a.get("references", [])
    return to_bibtex(refs) if kind == "bibtex" else to_ris(refs)


@router.get("/runs/{run_id}/artifacts/{kind}", summary="provenance (JSON), bibtex or ris of a finished run",
            responses={200: {"content": {"application/json": {}, "application/x-bibtex": {}, "application/x-research-info-systems": {}}},
                       **GONE, **errs(c409="The run has not finished")})
async def artifact(run_id: Rid, kind: Literal["provenance", "bibtex", "ris"], key: ApiKey = Depends(require_key),
                   svc: RunService = Depends(service)):
    out = await artifact_of(svc, run_id, kind, key)
    if isinstance(out, dict):
        return out
    return Response(out, media_type="application/x-bibtex; charset=utf-8" if kind == "bibtex" else "application/x-research-info-systems; charset=utf-8")


@spec_router.get("/openapi.json", include_in_schema=False)
async def openapi(request: Request):
    st = request.app.state
    if getattr(st, "api_openapi", None) is None:
        st.api_openapi = get_openapi(
            title="AI Scientist public API", version=st.settings.app_version or "1", openapi_version="3.1.0", routes=router.routes,
            description="Research runs over the same pipeline as the app. Send `Authorization: Bearer sci_...`. "
                        "Runs share the app's store; a key can only read, follow or cancel the runs it started.",
            tags=[{"name": "public", "description": "Authenticated with an operator-issued API key."}])
    return st.api_openapi

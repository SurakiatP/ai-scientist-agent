"""Server-owned runs: a submit returns at once, the run goes on without any browser, every event is stored and
fanned out, and the turn in the shared store is kept up to date by the server."""
import asyncio
import json
import logging
import time
import uuid
from contextlib import aclosing

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg
from sqlalchemy.dialects.postgresql import insert as pg_insert

from scientist import models as m
from scientist.events import Error
from scientist.routes_analyze import _slot, prepare
from scientist.pipeline import ask
from scientist.runqueue import RunQueue, Ticket
from scientist.store import MAX_IDX, MAX_JSON_BYTES, Conflict, Gone, Invalid, NotFound, Store, TooMany, _row
from scientist.usage import track

log = logging.getLogger(__name__)
WRITE_EVERY = 1.0  # seconds between turn writes while running
EMPTY_PROGRESS = {"waiting": None, "reasoning": "", "searches": [], "sources": {}, "answered": [], "writing": False,
                  "phase": "planning"}
REFUSAL_CODES = {"out_of_scope", "injection", "needs_search", "use_research", "empty_memory", "too_long",
                 "unsafe_request", "not_about_data", "check_failed"}  # frontend chat.ts REFUSAL_CODES
CUT_OFF = "The run ended before it finished. Please try again."
FAILED = "Something went wrong. Please try again."
TERMINAL = ("done", "refused", "error", "stopped", "interrupted")


def reduce_progress(p: dict, e: dict) -> dict:
    """Port of frontend/src/lib/progress.ts reduce (events as JSON dicts)."""
    t = e["type"]
    if t == "waiting":
        return {**p, "waiting": e["position"], "phase": "waiting"}
    if t == "strategy":
        return {**p, "reasoning": e["reasoning"], "searches": e["searches"], "phase": "searching"}
    if t == "sources":
        return {**p, "sources": {**p["sources"], e["term"]: p["sources"].get(e["term"], 0) + len(e["papers"])},
                "phase": p["phase"] if p["phase"] == "writing" else "searching"}
    if t == "answer":
        return {**p, "answered": [*p["answered"], e["term"]], "writing": True, "phase": "writing"}
    if t in ("final_answer", "complete"):
        return {**p, "writing": False, "phase": "done"}
    return p


def reduce_analysis(a: dict, e: dict) -> dict:
    """Port of reduceAnalysis in frontend/src/lib/run.ts."""
    t = e["type"]
    if t == "analysis_step":
        return a if e["step"] in a["steps"] else {**a, "steps": [*a["steps"], e["step"]]}
    if t == "analysis_script":
        return {**a, "script": e["code"]}
    if t == "analysis_result":
        return {**a, **{k: e[k] for k in ("quality", "tables", "findings", "timings", "artifacts")}}
    return a


class Run:
    """In-memory state of one active run."""

    def __init__(self, row: dict, ticket: Ticket, body, file_name: str, ext: str):
        self.row, self.id, self.ticket, self.body, self.file_name, self.ext = row, row["id"], ticket, body, file_name, ext
        self.seq = 0
        self.subs: set[asyncio.Queue] = set()
        self.task: asyncio.Task | None = None
        self.timer: asyncio.Task | None = None  # trailing flush of the throttled turn write
        self.progress, self.analysis = dict(EMPTY_PROGRESS), None
        self.out: dict | None = None  # terminal turn fields once an outcome event arrived
        self.last, self.dirty = 0.0, False
        self.gone = False  # the turn was removed under the run
        self.stopped = False  # a user cancel was accepted
        self.ending = False  # the final write has started: nothing may cancel the task any more

    def cancel_task(self) -> None:
        if not self.ending and not self.task.cancelling():
            self.task.cancel()


class RunService:
    def __init__(self, st, data: Store, queue: RunQueue):
        self.st, self.data, self.queue = st, data, queue  # st: app.state (runner, client, store are set at startup)
        self.live: dict[str, Run] = {}
        self.closing = False
        self._bg: set[asyncio.Task] = set()

    # --- submit ----------------------------------------------------------------------------------------------------
    async def submit(self, body, client_id: str) -> dict:
        analyze = body.kind == "analyze"
        name = ext = ""
        if analyze:
            if not body.file_id:
                raise Invalid("file_id is required")
            _, name, ext = await prepare(self.st, body.file_id)
        rid = str(uuid.uuid4())
        self.queue.admit(client_id)  # Rejected -> 429; no await between admit and ticket
        ticket = self.queue.ticket(rid, client_id, "analysis" if analyze else "research")
        try:
            row, turn = await self._create(body, client_id, rid, name)
        except BaseException:
            ticket.close()
            raise
        run = Run(row, ticket, body, name, ext)
        self.live[rid] = run
        run.task = asyncio.create_task(self._run(run))
        self._bg.add(run.task)
        run.task.add_done_callback(self._bg.discard)
        run.task.add_done_callback(lambda _: ticket.close())  # whatever happened, the slot is given back
        self.data._changed("turn", turn, session_id=str(turn["session_id"]))
        return {"run": self.view(row, client_id), "turn": turn}

    async def _create(self, body, client_id: str, rid: str, file_name: str) -> tuple[dict, dict]:
        """The turn (new, or an approved plan) and the run row, in one transaction under the session lock."""
        analyze = body.kind == "analyze"
        async with self.data.tx() as s:
            sess = await self.data._get(s, m.sessions, body.session_id)
            if sess is None or sess.deleted_at is not None:
                raise NotFound("session")
            t = await self.data._get(s, m.turns, body.turn_id)
            plan = [p.model_dump() for p in body.plan] if body.plan else None
            if t is None:
                if (await s.execute(sa.select(m.turn_tombstones.c.id).where(m.turn_tombstones.c.id == body.turn_id))).first():
                    raise Gone("turn was removed by an edit")
                n, top = (await s.execute(sa.select(sa.func.count(), sa.func.coalesce(sa.func.max(m.turns.c.idx), -1))
                                          .where(m.turns.c.session_id == body.session_id))).one()
                if n >= self.data.settings.store_max_turns or top + 1 > MAX_IDX:
                    raise TooMany("session is full")
                fname = (body.file_name or file_name)[:120]
                vals = {"id": body.turn_id, "session_id": body.session_id, "idx": top + 1, "question": body.question[:4000],
                        "mode": "analysis" if analyze else body.mode, "status": "running", "progress": EMPTY_PROGRESS,
                        "plan": plan, "run_id": rid, "version": 1,
                        "analysis": {"fileId": body.file_id, **({"fileName": fname} if fname else {}), "steps": []}
                        if analyze else None}
                turn = _row((await s.execute(pg_insert(m.turns).values(**vals).returning(m.turns))).one())
            elif t.session_id != body.session_id:
                raise Conflict("turn belongs to another session")
            elif t.status == "awaiting_plan" and not analyze:
                turn = _row((await s.execute(sa.update(m.turns).where(m.turns.c.id == body.turn_id).values(
                    status="running", progress=EMPTY_PROGRESS, plan=plan or t.plan, run_id=rid, version=t.version + 1,
                    updated_at=sa.func.now()).returning(m.turns))).one())
            else:
                raise Conflict("turn already exists")
            row = _row((await s.execute(sa.insert(m.runs).values(
                id=rid, client_id=client_id, session_id=body.session_id, turn_id=body.turn_id, kind=body.kind,
                mode="analysis" if analyze else body.mode, status="queued",
                request=body.model_dump(mode="json", exclude={"session_id", "turn_id"})).returning(m.runs))).one())
            await s.execute(sa.update(m.sessions).where(m.sessions.c.id == body.session_id)
                            .values(updated_at=sa.func.now(), sort_ts=sa.func.now()))
        return row, turn

    # --- the run itself --------------------------------------------------------------------------------------------
    def _generator(self, run: Run):
        st, body = self.st, run.body
        if body.kind == "analyze":
            events, mode = _slot(body.file_id, body.question, gate=run.ticket, store=st.store, settings=st.settings,
                                 name=run.file_name, ext=run.ext), "analysis"
        else:
            events, mode = ask(body.question, st.runner, settings=st.settings, client=st.client, gate=run.ticket,
                               mode=body.mode, history=body.history, plan=body.plan, memory=body.memory), body.mode
        return track(events, mode=mode, db=st.db, session_id=body.session_id, turn_id=body.turn_id)

    async def _run(self, run: Run) -> None:
        body, analyze = run.body, run.body.kind == "analyze"
        run.ticket.on_start = lambda: self._spawn(self._mark(run))
        if analyze:
            run.analysis = {"fileId": body.file_id, **({"fileName": n} if (n := (body.file_name or run.file_name)[:120]) else {}),
                            "steps": []}
        status, out = "", {}
        try:
            async with aclosing(self._generator(run)) as events:
                async for e in events:
                    d = json.loads(e.model_dump_json())
                    await self._emit(run, d)
                    if not analyze:  # an analysis turn keeps its empty progress, as in the browser
                        run.progress = reduce_progress(run.progress, d)
                    else:
                        run.analysis = reduce_analysis(run.analysis, d)
                    run.out = _outcome(run.out, d)
                    run.dirty = True
                    if run.out is None:
                        await self._throttled(run)
            if run.gone:
                status, out = "stopped", {"status": "stopped", "_err": "stopped"}
            elif run.out and not (not analyze and run.out["status"] == "done" and "answer" not in run.out):
                status, out = run.out["status"], run.out
            else:  # ended without an outcome (or an ask that completed without an answer)
                status, out = "error", {"status": "error", "error": CUT_OFF, "_err": "cut_off"}
        except asyncio.CancelledError:
            if run.out and not run.gone:  # it had finished: the real outcome wins over a late cancel
                status, out = run.out["status"], run.out
            elif self.closing and not run.stopped and not run.gone:
                status, out = "interrupted", {"status": "interrupted", "error": "The run was interrupted.", "_err": "interrupted"}
            else:
                status, out = "stopped", {"status": "stopped", "error": "The run was stopped.", "_err": "stopped"}
        except Exception:
            log.exception("run %s failed", run.id)
            status, out = "error", {"status": "error", "error": FAILED, "_err": "failed"}
        finally:
            run.ending = True
            run.ticket.close()  # usually already released by the pipeline's own finally
            if status in ("done", "error"):
                self.queue.record(run.ticket)
        # the final write is its own task: a second cancel (user, shutdown) must not abort it
        fin = asyncio.ensure_future(self._finalize(run, status, out))
        while True:
            try:
                await asyncio.shield(fin)
                break
            except asyncio.CancelledError:
                if fin.done():
                    break

    async def _throttled(self, run: Run) -> None:
        """Turn write at most once per second; a skipped one is flushed by a timer, so the last events of a burst
        are not held back until the next event."""
        if time.monotonic() - run.last >= WRITE_EVERY:
            if run.timer:
                run.timer.cancel()
            await self._write(run)
        elif not run.timer or run.timer.done():
            run.timer = asyncio.create_task(self._flush(run))

    async def _write(self, run: Run) -> None:
        run.last, run.dirty = time.monotonic(), False
        fields = _cap({"progress": run.progress, **_a(run.analysis)})
        if await self.data.write_turn_server(run.body.turn_id, **fields) is None:
            run.gone = True  # edited away or deleted: stop paying for it
            run.cancel_task()

    async def _flush(self, run: Run) -> None:
        await asyncio.sleep(max(0.0, run.last + WRITE_EVERY - time.monotonic()))
        if run.dirty and not run.ending and run.out is None:
            await self._write(run)

    async def _finalize(self, run: Run, status: str, out: dict) -> None:
        body = run.body
        try:
            if run.timer:
                run.timer.cancel()
                await asyncio.gather(run.timer, return_exceptions=True)
            if status in ("stopped", "interrupted"):  # attached streams learn how it ended
                await self._emit(run, json.loads(Error(message=status, code=status).model_dump_json()))
            elif out.get("_err") in ("cut_off", "failed"):  # no terminal event came from the pipeline: say so, replayably
                await self._emit(run, json.loads(Error(message=out.get("error") or "", code=out["_err"]).model_dump_json()))
            out = dict(out)
            err = out.pop("_err", None)
            code = out.pop("_code", None)
            progress = {**run.progress, **({"_code": code} if code else {}), **({"_err": err} if err else {})}
            if not run.gone:
                fields = _cap({"progress": progress, **_a(run.analysis), **out})
                if await self.data.write_turn_server(body.turn_id, **fields) is None:
                    status = "stopped"  # the turn vanished before the end: nothing to write, record the run as stopped
            async with self.data.tx() as s:
                await s.execute(sa.update(m.runs).where(m.runs.c.id == run.id, m.runs.c.status.in_(("queued", "running")))
                                .values(status=status, finished_at=sa.func.now(), error=out.get("error")))
        except Exception:
            log.exception("run %s: final write failed", run.id)
        finally:
            self.live.pop(run.id, None)
            for q in run.subs:
                q.put_nowait(None)

    def _spawn(self, coro) -> None:
        t = asyncio.create_task(coro)
        self._bg.add(t)
        t.add_done_callback(self._bg.discard)

    async def _mark(self, run: Run) -> None:
        """The slot was granted: the run is running now."""
        try:
            async with self.data.tx() as s:
                await s.execute(sa.update(m.runs).where(m.runs.c.id == run.id, m.runs.c.status == "queued")
                                .values(status="running", started_at=sa.func.now()))
        except Exception:
            log.exception("run %s: status not written", run.id)

    async def _emit(self, run: Run, d: dict) -> None:
        run.seq += 1
        try:
            async with self.data.tx() as s:
                await s.execute(sa.insert(m.run_events).values(run_id=run.id, seq=run.seq, event=d))
        except Exception:  # live viewers still get it; a replay will miss it
            log.exception("run %s: event %s not stored", run.id, run.seq)
        for q in run.subs:
            q.put_nowait((run.seq, d))

    # --- follow / cancel -------------------------------------------------------------------------------------------
    async def get(self, rid: str) -> dict | None:
        async with self.data.db.session() as s:
            r = (await s.execute(sa.select(m.runs).where(m.runs.c.id == rid))).first()
        return _row(r) if r else None

    def view(self, row: dict, client_id: str | None) -> dict:
        """The run as the API shows it. client_id is never exposed (it is the cancel permission): `mine` says whether
        the caller's id is the submitter's."""
        out = {k: row[k] for k in ("id", "session_id", "turn_id", "kind", "mode", "status", "created_at", "started_at",
                                   "finished_at", "error")}
        out["mine"] = client_id is not None and row["client_id"] == client_id
        if (run := self.live.get(row["id"])) and run.ticket.state == "queued":
            out["position"], out["eta_seconds"] = run.ticket.position, run.ticket.eta()
        return out

    async def events(self, rid: str, after: int, ping: float):
        """(seq, event) pairs after `after`, then live ones until the run ends; seq None = a ping. Disconnecting
        (closing this generator) never touches the run."""
        run = self.live.get(rid)
        q: asyncio.Queue = asyncio.Queue()
        if run:
            run.subs.add(q)  # subscribe before reading the store: nothing falls in the gap
        try:
            async with self.data.db.session() as s:
                rows = (await s.execute(sa.select(m.run_events.c.seq, m.run_events.c.event)
                                        .where(m.run_events.c.run_id == rid, m.run_events.c.seq > after)
                                        .order_by(m.run_events.c.seq))).all()
            for r in rows:
                after = r.seq
                yield r.seq, r.event
            if run and run.ticket.state == "queued":  # fresh position and wait, whatever was stored
                yield None, {"type": "waiting", "position": run.ticket.position, "eta_seconds": run.ticket.eta()}
            while run:
                if rid not in self.live and q.empty():
                    return
                try:
                    msg = await asyncio.wait_for(q.get(), ping)
                except asyncio.TimeoutError:
                    yield None, None
                    continue
                if msg is not None and msg[0] > after:
                    after = msg[0]
                    yield msg
        finally:
            if run:
                run.subs.discard(q)

    async def cancel(self, rid: str, client_id: str) -> dict | None:
        """None = no such run; PermissionError = not the submitter. Idempotent."""
        row = await self.get(rid)
        if row is None:
            return None
        if row["client_id"] != client_id:
            raise PermissionError
        if run := self.live.get(rid):
            run.stopped = True
            run.cancel_task()
            await asyncio.wait({run.task})  # the final write lands before we answer
            row = await self.get(rid)
        return row

    # --- lifecycle -------------------------------------------------------------------------------------------------
    async def startup(self) -> None:
        """Whatever was queued or running when the last process died will never finish."""
        async with self.data.tx() as s:
            ids = [r.turn_id for r in await s.execute(
                sa.update(m.runs).where(m.runs.c.status.in_(("queued", "running")))
                .values(status="interrupted", finished_at=sa.func.now()).returning(m.runs.c.turn_id)) if r.turn_id]
            turns = [_row(r) for r in await s.execute(
                sa.update(m.turns).where(m.turns.c.id.in_(ids), m.turns.c.status == "running")
                .values(status="interrupted", version=m.turns.c.version + 1, updated_at=sa.func.now(),
                        error="The run was interrupted.",
                        progress=sa.func.coalesce(m.turns.c.progress, sa.cast(sa.literal("{}"), pg.JSONB))
                        .op("||")(sa.cast(sa.literal('{"_err": "interrupted"}'), pg.JSONB)))
                .returning(m.turns))] if ids else []
        for t in turns:
            self.data._changed("turn", t, session_id=str(t["session_id"]))

    async def shutdown(self) -> None:
        """Cancel every run (their finally blocks kill bridges); each is recorded as interrupted."""
        self.closing = True
        for r in list(self.live.values()):
            r.cancel_task()
        await asyncio.gather(*self._bg, return_exceptions=True)


def _cap(fields: dict) -> dict:
    """Server writes skip the client-side size caps, but not without limit: 4x the per-field cap. Over it, the
    progress (never the answer) is slimmed, and an analysis keeps only the first rows of its tables."""
    ceil = 4 * MAX_JSON_BYTES[0]
    size = lambda v: len(json.dumps(v, ensure_ascii=False))  # noqa: E731
    if size(fields["progress"]) > ceil:
        log.warning("turn progress over %s bytes: slimmed", ceil)
        fields["progress"] = {**fields["progress"], "reasoning": "", "searches": [], "sources": {}, "answered": []}
    if (a := fields.get("analysis")) is not None and size(a) > ceil:
        log.warning("turn analysis over %s bytes: table rows cut", ceil)
        fields["analysis"] = {**a, "tables": [{**t, "rows": t.get("rows", [])[:20], "truncated": True} for t in a.get("tables", [])]}
    return fields


def _a(analysis: dict | None) -> dict:
    return {} if analysis is None else {"analysis": analysis}


def _outcome(out: dict | None, d: dict) -> dict | None:
    """Terminal turn fields so far, folded like run.ts does (later events win; an analysis stays 'done' once it is)."""
    t = d["type"]
    if t == "final_answer":
        return {"status": "done", "answer": {"content": d["content"], "references": d["references"]}}
    if t == "refused":
        code = d.get("code")
        return {"status": "refused", "refused": d["reason"][:4000], **({"_code": code} if code in REFUSAL_CODES else {})}
    if t == "error":
        return {"status": "error", "error": d["message"][:2048]}
    if t in ("analysis_result", "complete"):
        return out or {"status": "done"}
    return out

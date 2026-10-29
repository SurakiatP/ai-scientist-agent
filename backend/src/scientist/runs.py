"""Server-owned runs: a submit returns at once, the run goes on without any browser, every event is stored and
fanned out, and the turn in the shared store is kept up to date by the server."""
import asyncio
import json
import logging
import os
import socket
import time
import uuid
from contextlib import aclosing, asynccontextmanager

import sqlalchemy as sa
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql as pg
from sqlalchemy.dialects.postgresql import insert as pg_insert

from scientist import models as m
from scientist.docs_answer import answer_docs
from scientist.events import Error
from scientist.routes_analyze import _slot, prepare
from scientist.pipeline import ask
from scientist.pgbus import GAP
from scientist.runqueue import RunQueue, Ticket
from scientist.store import MAX_IDX, MAX_JSON_BYTES, Conflict, Gone, Invalid, LostLease, NotFound, Store, TooMany, _row
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
POLL_EVENTS = 2.0  # a viewer re-reads the event table at least this often, whatever the notifications did
CANCEL_WAIT = 10.0  # a cancel waits this long for the owner's final write
LOST = "The run was interrupted."


def _seen(p: dict, ids: list) -> dict:
    """`seen` of progress.ts: source ids in first-seen order, max 100; the key is added only when something is new."""
    cur = p.get("seen", [])
    nxt = list(dict.fromkeys([*cur, *(i for i in ids if isinstance(i, str) and i)]))[:100]
    return p if len(nxt) == len(cur) else {**p, "seen": nxt}


def reduce_progress(p: dict, e: dict) -> dict:
    """Port of frontend/src/lib/progress.ts reduce (events as JSON dicts)."""
    t = e["type"]
    if t == "waiting":
        return {**p, "waiting": e["position"], "phase": "waiting"}
    if t == "strategy":
        return {**p, "reasoning": e["reasoning"], "searches": e["searches"], "phase": "searching"}
    if t == "replan":
        r = {"reasoning": e["reasoning"], "thin": e["thin"], "searches": e["searches"]}
        return {**p, "searches": [*p["searches"], *e["searches"]], "replans": [*p.get("replans", []), r], "phase": "searching"}
    if t == "sources":
        return _seen({**p, "sources": {**p["sources"], e["term"]: p["sources"].get(e["term"], 0) + len(e["papers"])},
                      "phase": p["phase"] if p["phase"] == "writing" else "searching"},
                     [x.get("source") for x in e["papers"] if isinstance(x, dict)])
    if t == "records":
        return _seen(p, [r.get("database") for r in e.get("records") or [] if isinstance(r, dict)])
    if t == "answer":
        return {**p, "answered": [*p["answered"], e["term"]], "writing": True, "phase": "writing"}
    if t in ("final_answer", "complete"):
        return {**p, "writing": False, "phase": "done"}
    if t == "restarted":  # the run starts over after its process died: nothing so far counts (the docs picked stay)
        return {**EMPTY_PROGRESS, "restarted": True, **({"_docs": p["_docs"]} if "_docs" in p else {})}
    return p


def reduce_analysis(a: dict, e: dict) -> dict:
    """Port of reduceAnalysis in frontend/src/lib/run.ts."""
    t = e["type"]
    if t == "restarted":  # attempt 1's steps do not count; the file stays
        return {**{k: a[k] for k in ("fileId", "fileName") if k in a}, "steps": []}
    if t == "analysis_step":
        return a if e["step"] in a["steps"] else {**a, "steps": [*a["steps"], e["step"]]}
    if t == "analysis_script":
        return {**a, "script": e["code"]}
    if t == "analysis_result":
        return {**a, **{k: e[k] for k in ("quality", "tables", "findings", "timings", "artifacts")},
                **({"provenance": e["provenance"]} if e.get("provenance") else {})}
    return a


class Run:
    """In-memory state of one active run."""

    def __init__(self, row: dict, ticket: Ticket, body, file_name: str, ext: str):
        self.row, self.id, self.ticket, self.body, self.file_name, self.ext = row, row["id"], ticket, body, file_name, ext
        self.task: asyncio.Task | None = None
        self.timer: asyncio.Task | None = None  # trailing flush of the throttled turn write
        self.progress, self.analysis = dict(EMPTY_PROGRESS), None
        self.out: dict | None = None  # terminal turn fields once an outcome event arrived
        self.last, self.dirty = 0.0, False
        self.gone = False  # the turn was removed under the run
        self.stopped = False  # a user cancel was accepted
        self.ending = False  # the final write has started: nothing may cancel the task any more
        self.lost = False  # the lease was lost to another process: this copy must write nothing more
        self.released = False  # a graceful shutdown: the run goes back to the queue, written by the release
        self.attempt = row["attempt"]

    def cancel_lost(self) -> None:
        self.lost = True
        self.cancel_task()

    def cancel_task(self) -> None:
        if self.task and not self.ending and not self.task.cancelling():
            self.task.cancel()


class _Never:
    """A subscription that never delivers (no PgBus): waits time out and the loops fall back to polling."""

    def __aiter__(self):
        return self

    async def __anext__(self):
        await asyncio.Event().wait()


class RunService:
    def __init__(self, st, data: Store, queue: RunQueue):
        self.st, self.data, self.queue = st, data, queue  # st: app.state (runner, client, store are set at startup)
        self.pid = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:6]}"  # this process, for leases
        self.live: dict[str, Run] = {}  # the runs executing in this process
        self.closing = False
        self._bg: set[asyncio.Task] = set()
        self._loops: list[asyncio.Task] = []

    # --- cross-process plumbing -----------------------------------------------------------------------------------------
    @asynccontextmanager
    async def _listen(self, channel: str):
        if bus := getattr(self.st, "pgbus", None):
            async with bus.subscribe(channel) as it:
                yield it
        else:
            yield _Never()

    async def _notify(self, channel: str, payload: str, s=None) -> None:
        if bus := getattr(self.st, "pgbus", None):
            await bus.notify(channel, payload, session=s)

    @staticmethod
    async def _wait(it, timeout: float, match=lambda _: True) -> bool:
        """Until a notification for `match` (or GAP: something may have been missed) arrives; False on timeout."""
        end = time.monotonic() + timeout
        while (left := end - time.monotonic()) > 0:
            try:
                msg = await asyncio.wait_for(anext(it), left)
            except asyncio.TimeoutError:
                return False
            if msg is GAP or match(msg):
                return True
        return False

    # --- submit ----------------------------------------------------------------------------------------------------
    async def submit(self, body, client_id: str) -> dict:
        analyze = body.kind == "analyze"
        docs = not analyze and body.mode == "docs"
        name = ext = ""
        picked: list[dict] = []
        if docs:
            picked = await self._check_docs(body.doc_ids)
        if analyze:
            if not body.file_id:
                raise Invalid("file_id is required")
            _, name, ext = await prepare(self.st, body.file_id)
        rid = str(uuid.uuid4())
        pool = "analysis" if analyze or docs else "research"  # docs read PDFs in the sandbox: its pool
        row, turn = await self._create(body, client_id, rid, name, picked, pool)  # Rejected -> 429; a scheduler claims it
        return {"run": await self.view(row, client_id), "turn": turn}

    async def _check_docs(self, ids: list[str]) -> list[dict]:
        """422 unless every id is a live (not deleted) PDF file of the shared store. Returns [{id, name}] in request order."""
        async with self.data.db.session() as s:
            ok = {r.id: r.name for r in await s.execute(sa.select(m.files.c.id, m.files.c.name).where(
                m.files.c.id.in_(ids), m.files.c.deleted_at.is_(None), sa.func.lower(m.files.c.kind) == "pdf"))}
        if bad := [i for i in ids if i not in ok]:
            raise HTTPException(422, f"document {bad[0]} was not found or is not a PDF")
        if not self.st.settings.sandbox_enabled:
            raise HTTPException(503, "documents need the sandbox, which is disabled on this deployment")
        if self.st.store is None:
            raise HTTPException(503, "file storage unavailable")
        return [{"id": i, "name": ok[i][:500]} for i in ids]

    async def _create(self, body, client_id: str, rid: str, file_name: str, picked: list[dict] | None = None,
                      pool: str = "research") -> tuple[dict, dict]:
        """The turn (new, or an approved plan) and the run row, in one transaction under the session lock; the
        admission caps are counted in the same transaction."""
        analyze = body.kind == "analyze"
        async with self.data.tx() as s:
            await self.queue.admit(client_id, s)
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
                        "mode": "analysis" if analyze else body.mode, "pack": None if body.mode in ("chat", "docs") and not analyze else body.pack, "status": "running", "progress": {**EMPTY_PROGRESS, "_docs": picked} if picked else EMPTY_PROGRESS,
                        "plan": plan, "run_id": rid, "version": 1,
                        "analysis": {"fileId": body.file_id, **({"fileName": fname} if fname else {}), "steps": []}
                        if analyze else None}
                turn = _row((await s.execute(pg_insert(m.turns).values(**vals).returning(m.turns))).one())
            elif t.session_id != body.session_id:
                raise Conflict("turn belongs to another session")
            elif t.status == "awaiting_plan" and not analyze:
                if body.mode == "docs":
                    raise HTTPException(422, "a plan review cannot become a docs turn")
                turn = _row((await s.execute(sa.update(m.turns).where(m.turns.c.id == body.turn_id).values(
                    status="running", progress=EMPTY_PROGRESS, plan=plan or t.plan, run_id=rid, pack=body.pack, version=t.version + 1,
                    updated_at=sa.func.now()).returning(m.turns))).one())
            else:
                raise Conflict("turn already exists")
            row = _row((await s.execute(sa.insert(m.runs).values(
                id=rid, client_id=client_id, session_id=body.session_id, turn_id=body.turn_id, kind=body.kind,
                mode="analysis" if analyze else body.mode, status="queued", pool=pool,
                request=body.model_dump(mode="json", exclude={"session_id", "turn_id"})).returning(m.runs))).one())
            await s.execute(sa.update(m.sessions).where(m.sessions.c.id == body.session_id)
                            .values(updated_at=sa.func.now(), sort_ts=sa.func.now()))
            await self.data._changed(s, "turn", turn, session_id=str(turn["session_id"]))
            await self._notify("runs", rid, s)  # a scheduler (this process or another) claims it
        return row, turn

    # --- the run itself --------------------------------------------------------------------------------------------
    def _generator(self, run: Run):
        st, body = self.st, run.body
        if body.kind == "analyze":
            events, mode = _slot(body.file_id, body.question, gate=run.ticket, store=st.store, settings=st.settings,
                                 name=run.file_name, ext=run.ext, pack=body.pack), "analysis"
        elif body.mode == "docs":
            events, mode = answer_docs(body.question, body.doc_ids, db=st.db, store=st.store, settings=st.settings,
                                       gate=run.ticket, history=body.history), "docs"
        else:
            events, mode = ask(body.question, st.runner, settings=st.settings, client=st.client, gate=run.ticket,
                               mode=body.mode, history=body.history, plan=body.plan, memory=body.memory,
                               pack=body.pack), body.mode
        return track(events, mode=mode, db=st.db, session_id=body.session_id, turn_id=body.turn_id)

    async def _run(self, run: Run) -> None:
        body, analyze = run.body, run.body.kind == "analyze"
        status, out = "", {}
        try:
            if run.stopped:  # a cancel was requested while it waited
                raise asyncio.CancelledError
            if analyze:
                _, run.file_name, run.ext = await prepare(self.st, body.file_id)
                run.analysis = {"fileId": body.file_id, **({"fileName": n} if (n := (body.file_name or run.file_name)[:120]) else {}),
                                "steps": []}
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
                run.released = True  # shutdown puts it back in the queue (see _release)
            else:
                status, out = "stopped", {"status": "stopped", "error": "The run was stopped.", "_err": "stopped"}
        except Exception:
            log.exception("run %s failed", run.id)
            status, out = "error", {"status": "error", "error": FAILED, "_err": "failed"}
        finally:
            run.ending = True
            run.ticket.close()  # usually already released by the pipeline's own finally
        if run.lost or run.released:  # another process owns it now / shutdown releases it: write nothing
            if self.live.get(run.id) is run:
                del self.live[run.id]
            return
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
        try:
            if await self.data.write_turn_server(run.body.turn_id, _fence=self._mine(run), **fields) is None:
                run.gone = True  # edited away or deleted: stop paying for it
                run.cancel_task()
        except LostLease:
            run.cancel_lost()

    async def _flush(self, run: Run) -> None:
        await asyncio.sleep(max(0.0, run.last + WRITE_EVERY - time.monotonic()))
        if run.dirty and not run.ending and run.out is None:
            await self._write(run)

    def _mine(self, run: Run):
        """The runs row as long as this copy owns it: this process, this attempt, still running."""
        c = m.runs.c
        return sa.and_(c.id == run.id, c.worker == self.pid, c.attempt == run.attempt, c.status == "running")

    async def _finalize(self, run: Run, status: str, out: dict) -> None:
        """One transaction under the run row's lock: the closing events, the turn and the run's final status. Nothing is
        written when the row is no longer this copy's."""
        body = run.body
        try:
            if run.timer:
                run.timer.cancel()
                await asyncio.gather(run.timer, return_exceptions=True)
            async with self.data.tx() as s:
                if (await s.execute(sa.select(m.runs.c.id).where(self._mine(run)).with_for_update())).first() is None:
                    return
                if status in ("stopped", "interrupted"):  # attached streams learn how it ended
                    await self._event(s, run.id, json.loads(Error(message=status, code=status).model_dump_json()))
                elif out.get("_err") in ("cut_off", "failed") and out is not run.out:  # no terminal event came from the pipeline: say so, replayably
                    await self._event(s, run.id, json.loads(Error(message=out.get("error") or "", code=out["_err"]).model_dump_json()))
                out = dict(out)
                err = out.pop("_err", None)
                code = out.pop("_code", None)
                progress = {**run.progress, **({"_code": code} if code else {}), **({"_err": err} if err else {})}
                if not run.gone:
                    fields = _cap({"progress": progress, **_a(run.analysis), **out})
                    if await self.data.write_turn_in(s, body.turn_id, **fields) is None:
                        status = "stopped"  # the turn vanished before the end: nothing to write, record the run as stopped
                await s.execute(sa.update(m.runs).where(self._mine(run))
                                .values(status=status, finished_at=sa.func.now(), error=out.get("error")))
                await self._notify("run_events", f"{run.id}:end", s)  # followers see the terminal row
                await self._notify("runs", run.id, s)  # a slot is free: let any scheduler claim
        except Exception:
            log.exception("run %s: final write failed", run.id)
        finally:
            if self.live.get(run.id) is run:
                del self.live[run.id]

    async def _event(self, s, rid: str, d: dict, fence=None) -> int | None:
        """Store an event under the next seq of the run (unique across restarts: it continues from max(seq)) and
        announce it when the transaction commits. With `fence` (a runs condition) nothing is written, and None returned,
        unless it holds."""
        where = " where exists (select 1 from runs where id = cast(:r as uuid) and worker = :w and attempt = :a and status = 'running' for share)" if fence else ""
        args = {"r": rid, "e": json.dumps(d), **(fence or {})}
        seq = (await s.execute(sa.text(
            "insert into run_events(run_id, seq, event) select cast(:r as uuid), "
            "coalesce((select max(seq) from run_events where run_id = cast(:r as uuid)), 0) + 1, cast(:e as jsonb)" + where +
            " returning seq"), args)).scalar_one_or_none()
        if seq is not None:
            await self._notify("run_events", f"{rid}:{seq}", s)
        return seq

    async def _emit(self, run: Run, d: dict) -> None:
        try:
            async with self.data.tx() as s:
                if await self._event(s, run.id, d, {"w": self.pid, "a": run.attempt}) is None:
                    run.cancel_lost()  # not ours any more
        except Exception:  # a replay will miss it
            log.exception("run %s: event not stored", run.id)

    # --- follow / cancel -------------------------------------------------------------------------------------------
    async def get(self, rid: str) -> dict | None:
        async with self.data.db.session() as s:
            r = (await s.execute(sa.select(m.runs).where(m.runs.c.id == rid))).first()
        return _row(r) if r else None

    async def _waiting(self, row: dict) -> dict | None:
        """Position and ETA of a queued run from the rows (fair order, last finished runs), None when it is not waiting."""
        async with self.data.db.session() as s:
            if (pos := await self.queue.position(s, row)) == 0:
                return None
            return {"type": "waiting", "position": pos, "eta_seconds": await self.queue.eta(s, row["pool"], pos)}

    async def view(self, row: dict, client_id: str | None) -> dict:
        """The run as the API shows it. client_id is never exposed (it is the cancel permission): `mine` says whether
        the caller's id is the submitter's."""
        out = {k: row[k] for k in ("id", "session_id", "turn_id", "kind", "mode", "status", "created_at", "started_at",
                                   "finished_at", "error")}
        out["mine"] = client_id is not None and row["client_id"] == client_id
        if row["status"] == "queued" and (w := await self._waiting(row)):
            out["position"], out["eta_seconds"] = w["position"], w["eta_seconds"]
        return out

    async def events(self, rid: str, after: int, ping: float):
        """(seq, event) pairs after `after` read from the table, then new ones as notifications (or a poll) say there are,
        until the run is terminal and nothing is left; seq None = a ping or the live queue position. Works for a run
        executing in any process. Disconnecting (closing this generator) never touches the run."""
        last_out, last_wait = time.monotonic(), None
        async with self._listen("run_events") as it:  # subscribe before reading: nothing falls in the gap
            while True:
                row = await self.get(rid)  # status first: a terminal row means every event is already stored
                async with self.data.db.session() as s:
                    rows = (await s.execute(sa.select(m.run_events.c.seq, m.run_events.c.event)
                                            .where(m.run_events.c.run_id == rid, m.run_events.c.seq > after)
                                            .order_by(m.run_events.c.seq))).all()
                for r in rows:
                    after, last_out = r.seq, time.monotonic()
                    yield r.seq, r.event
                if row is None or (row["status"] in TERMINAL and not rows):
                    return
                if row["status"] == "queued" and (w := await self._waiting(row)) and w != last_wait:
                    last_wait, last_out = w, time.monotonic()
                    yield None, w  # fresh position and wait: not a stored event, so no id
                if not await self._wait(it, min(ping, POLL_EVENTS), lambda p: p.startswith(f"{rid}:")) \
                        and time.monotonic() - last_out >= ping:
                    last_out = time.monotonic()
                    yield None, None

    def _cancel_local(self, rid: str) -> None:
        if run := self.live.get(rid):
            run.stopped = True
            run.cancel_task()

    async def cancel(self, rid: str, client_id: str) -> dict | None:
        """None = no such run; PermissionError = not the submitter. Idempotent. A queued run is stopped here, in the
        database; a running one is asked to stop (its owner, in any process, does it) and we wait up to CANCEL_WAIT
        for its final write."""
        row = await self.get(rid)
        if row is None:
            return None
        if row["client_id"] != client_id:
            raise PermissionError
        if row["status"] == "queued" and await self._stop_queued(row):
            return await self.get(rid)
        async with self.data.tx() as s:
            await s.execute(sa.update(m.runs).where(m.runs.c.id == rid, m.runs.c.status.in_(("queued", "running")))
                            .values(cancel_requested=True))
            await self._notify("run_cancel", rid, s)
        self._cancel_local(rid)
        end = time.monotonic() + CANCEL_WAIT
        while (row := await self.get(rid)) and row["status"] in ("queued", "running") and time.monotonic() < end:
            await asyncio.sleep(0.05)
        return row

    async def _stop_queued(self, row: dict) -> bool:
        """Stopped before it ever ran. False when a scheduler claimed it first (then it is a running cancel)."""
        async with self.data.tx() as s:
            if not (await s.execute(sa.update(m.runs).where(m.runs.c.id == row["id"], m.runs.c.status == "queued")
                                    .values(status="stopped", finished_at=sa.func.now(), error="The run was stopped.", cancel_requested=True)
                                    .returning(m.runs.c.id))).first():
                return False
            await self._event(s, row["id"], json.loads(Error(message="stopped", code="stopped").model_dump_json()))
            await self._notify("run_events", f"{row['id']}:end", s)
            if row["turn_id"]:
                await self._end_turns(s, [row["turn_id"]], "stopped", "The run was stopped.", "stopped")
        return True

    async def _restart_turns(self, s, ids: list) -> None:
        """Still-running turns of restarted runs: progress back to the restarted state (the picked docs stay) and the
        analysis steps cleared, written as the stream's `restarted` event says."""
        t = m.turns.c
        for r in await s.execute(sa.select(t.id, t.progress, t.analysis).where(t.id.in_(ids), t.status == "running")):
            vals = {"progress": reduce_progress(r.progress or {}, {"type": "restarted"})}
            if r.analysis:
                vals["analysis"] = reduce_analysis(r.analysis, {"type": "restarted"})
            row = (await s.execute(sa.update(m.turns).where(t.id == r.id).values(**vals, version=t.version + 1, updated_at=sa.func.now())
                                   .returning(m.turns))).one()
            await self.data._changed(s, "turn", _row(row), session_id=str(_row(row)["session_id"]))

    async def _end_turns(self, s, ids: list, status: str, error: str, err: str) -> None:
        """The still-running turns of ended runs get their final state, announced to every process."""
        turns = [_row(r) for r in await s.execute(
            sa.update(m.turns).where(m.turns.c.id.in_(ids), m.turns.c.status == "running")
            .values(status=status, version=m.turns.c.version + 1, updated_at=sa.func.now(), error=error,
                    progress=sa.func.coalesce(m.turns.c.progress, sa.cast(sa.literal("{}"), pg.JSONB))
                    .op("||")(sa.cast(sa.literal(json.dumps({"_err": err})), pg.JSONB)))
            .returning(m.turns))]
        for t in turns:
            await self.data._changed(s, "turn", t, session_id=str(t["session_id"]))

    # --- scheduler, leases, sweep ----------------------------------------------------------------------------------
    async def startup(self) -> None:
        """Start this process's scheduler. Nothing is marked interrupted here: a run whose lease ran out (its process
        died, this one included) is found by the sweep and restarted or interrupted."""
        self.closing = False
        self._loops = [asyncio.create_task(c) for c in (self._scheduler(), self._cancels(), self._renewer())]

    async def _scheduler(self) -> None:
        async with self._listen("runs") as it:
            while True:
                try:
                    await self._sweep()
                    await self._claim_all()
                except Exception:
                    log.exception("scheduler pass failed")
                await self._wait(it, self.st.settings.scheduler_poll_seconds)

    async def _claim_all(self) -> None:
        for pool in self.queue.limits:
            while not self.closing:
                async with self.data.tx() as s:
                    row = await self.queue.claim(s, pool, self.pid, self.st.settings.run_lease_seconds)
                if row is None:
                    break
                try:
                    await self._launch(row)
                except Exception:
                    log.exception("run %s could not be started", row["id"])
                    self.live.pop(row["id"], None)  # _launch may have registered it before failing
                    await self._fail(row, FAILED)

    async def _fail(self, row: dict, message: str) -> None:
        """A claimed run that cannot start ends in error at once (only if the row is still this claim's)."""
        c = m.runs.c
        try:
            async with self.data.tx() as s:
                if (await s.execute(sa.update(m.runs).where(c.id == row["id"], c.worker == self.pid, c.attempt == row["attempt"], c.status == "running")
                                    .values(status="error", finished_at=sa.func.now(), error=message).returning(c.id))).first():
                    await self._event(s, row["id"], json.loads(Error(message=message, code="failed").model_dump_json()))
                    if row["turn_id"]:
                        await self._end_turns(s, [row["turn_id"]], "error", message, "failed")
                    await self._notify("run_events", f"{row['id']}:end", s)
                    await self._notify("runs", row["id"], s)
        except Exception:
            log.exception("run %s: failure not recorded", row["id"])

    async def _launch(self, row: dict) -> None:
        from scientist.routes_runs import RunIn  # routes_runs imports this module
        body = RunIn.model_validate({**row["request"], "session_id": str(row["session_id"]), "turn_id": str(row["turn_id"])})
        async with self.data.db.session() as s:
            prog = (await s.execute(sa.select(m.turns.c.progress).where(m.turns.c.id == body.turn_id))).scalar_one_or_none()
        ticket = Ticket(row["id"], row["client_id"], row["pool"])
        run = Run(row, ticket, body, "", "")
        if prog and prog.get("_docs"):
            run.progress = {**run.progress, "_docs": prog["_docs"]}
        if row["attempt"] > 1:  # a restart: the stream said so, so the stored turn must too
            run.progress = reduce_progress(run.progress, {"type": "restarted"})
        if old := self.live.get(run.id):  # a stale copy of this run (its lease lapsed here): it must not write any more
            old.cancel_lost()
        self.live[run.id] = run
        async with self.data.db.session() as s:  # a cancel that came in between the claim and now had no one to tell
            run.stopped = run.stopped or bool((await s.execute(sa.select(m.runs.c.cancel_requested).where(m.runs.c.id == run.id))).scalar_one_or_none())
        run.task = asyncio.create_task(self._run(run))
        self._bg.add(run.task)
        run.task.add_done_callback(self._bg.discard)
        run.task.add_done_callback(lambda _: ticket.close())  # whatever happened, the slot is given back

    async def _cancels(self) -> None:
        async with self._listen("run_cancel") as it:
            while True:
                msg = await anext(it)
                try:
                    if msg is GAP:
                        await self._renew_once()
                    else:
                        self._cancel_local(msg)
                except Exception:
                    log.exception("cancel check failed")

    async def _renewer(self) -> None:
        while True:
            await asyncio.sleep(self.st.settings.run_lease_seconds / 3)
            try:
                await self._renew_once()
            except Exception:
                log.exception("lease renewal failed")

    async def _renew_once(self) -> None:
        """Extend the lease of this process's live runs; a run that is no longer ours (swept after a stall) is dropped
        without writes, and a requested cancel is picked up even if its notification was missed."""
        if not self.live:
            return
        c = m.runs.c
        runs = list(self.live.values())
        async with self.data.tx() as s:
            mine = {(str(r.id), r.attempt): r.cancel_requested for r in await s.execute(
                sa.update(m.runs).where(sa.tuple_(c.id, c.attempt).in_([(r.id, r.attempt) for r in runs]), c.worker == self.pid, c.status == "running")
                .values(lease_until=sa.func.now() + sa.func.make_interval(0, 0, 0, 0, 0, 0, self.st.settings.run_lease_seconds))
                .returning(c.id, c.attempt, c.cancel_requested))}
        for run in runs:
            if (key := (run.id, run.attempt)) in mine:
                if mine[key]:
                    self._cancel_local(run.id)
            elif not run.ending:
                run.cancel_lost()

    async def _requeue(self, s, pred) -> None:
        """Running runs matching `pred` (an expired lease, or this process's own at shutdown) leave their owner: a
        requested cancel stops them, attempts left send them back to the queue with a `restarted` event, the last
        attempt interrupts them and their turns."""
        c, st = m.runs.c, self.st.settings
        stopped = [r for r in await s.execute(sa.update(m.runs).where(pred, c.cancel_requested)
                                              .values(status="stopped", finished_at=sa.func.now(), error="The run was stopped.")
                                              .returning(c.id, c.turn_id))]
        for r in stopped:
            await self._event(s, str(r.id), json.loads(Error(message="stopped", code="stopped").model_dump_json()))
            await self._notify("run_events", f"{r.id}:end", s)
        if stopped:
            await self._notify("runs", "stopped", s)
        if ids := [r.turn_id for r in stopped if r.turn_id]:
            await self._end_turns(s, ids, "stopped", "The run was stopped.", "stopped")
        again = (await s.execute(sa.update(m.runs).where(pred, c.attempt < st.run_max_attempts)
                                 .values(status="queued", attempt=c.attempt + 1, worker=None, lease_until=None, started_at=None)
                                 .returning(c.id))).scalars().all()
        for rid in again:
            await self._event(s, str(rid), {"type": "restarted"})
        if turns := [r[0] for r in await s.execute(sa.select(c.turn_id).where(c.id.in_(again), c.turn_id.is_not(None)))] if again else []:
            await self._restart_turns(s, turns)
        if again:
            await self._notify("runs", "restarted", s)
        ended = list(await s.execute(sa.update(m.runs).where(pred, c.attempt >= st.run_max_attempts)
                                     .values(status="interrupted", finished_at=sa.func.now()).returning(c.id, c.turn_id)))
        for r in ended:
            await self._notify("run_events", f"{r.id}:end", s)
        if ended:
            await self._notify("runs", "interrupted", s)
        if dead := [r.turn_id for r in ended if r.turn_id]:
            await self._end_turns(s, dead, "interrupted", LOST, "interrupted")

    async def _sweep(self) -> None:
        """Any process: a running run whose lease ran out is restarted, stopped or interrupted (see _requeue)."""
        c = m.runs.c
        async with self.data.tx() as s:
            await self._requeue(s, sa.and_(c.status == "running", sa.or_(c.lease_until.is_(None), c.lease_until < sa.func.now())))

    async def _release(self) -> None:
        """Graceful shutdown: this process's runs (also ones claimed but not yet launched) go back to the queue."""
        c = m.runs.c
        async with self.data.tx() as s:
            await self._requeue(s, sa.and_(c.status == "running", c.worker == self.pid))

    async def shutdown(self) -> None:
        """Stop scheduling, cancel every local run (their finally blocks kill bridges), then release them to the queue."""
        self.closing = True
        for t in self._loops:
            t.cancel()
        await asyncio.gather(*self._loops, return_exceptions=True)
        self._loops = []
        for r in list(self.live.values()):
            r.cancel_task()
        await asyncio.gather(*self._bg, return_exceptions=True)
        try:
            await self._release()
        except Exception:
            log.exception("could not release this process's runs; their leases will expire")


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
        return {"status": "done", "answer": {"content": d["content"], "references": d["references"], "records": d.get("records", []),
                                                         **({"doc_refs": d["doc_refs"]} if d.get("doc_refs") else {}),
                                                         **({"empty_files": d["empty_files"]} if d.get("empty_files") else {}),
                                                         **({"usage": d["usage"]} if d.get("usage") else {}),
                                                         **({"provenance": d["provenance"]} if d.get("provenance") else {})}}
    if t == "refused":
        code = d.get("code")
        return {"status": "refused", "refused": d["reason"][:4000], **({"_code": code} if code in REFUSAL_CODES else {})}
    if t == "error":
        code = d.get("code")
        return {"status": "error", "error": d["message"][:2048], **({"_err": code} if isinstance(code, str) and (code.startswith("docs_") or code == "failed") else {})}
    if t in ("analysis_result", "complete"):
        return out or {"status": "done"}
    return out

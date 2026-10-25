"""Shared-data repository (projects, sessions, turns, files, trash, import) and the change broadcaster.
No login: one dataset for everyone who reaches the server. Writes are optimistic: `version` must match or 409."""
import asyncio
import logging
import re
import uuid as uuidlib
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Literal

import sqlalchemy as sa
from pydantic import BaseModel, Field, TypeAdapter, ValidationError
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError

from scientist import models as m
from scientist.config import Settings
from scientist.db import Database

log = logging.getLogger(__name__)

UUID_RE = r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
FILE_RE = r"^[0-9a-f]{32}$"
OptUid = Field(None, pattern=UUID_RE)
MAX_TURNS, MAX_IDX, MAX_FILES, MAX_PROJECTS = 500, 999, 1000, 200
MAX_VERSION = 2_000_000_000
Mode = Literal["deep", "quick", "chat", "analysis"]
Status = Literal["running", "done", "refused", "error", "stopped", "interrupted", "awaiting_plan"]
TABLES = {"project": m.projects, "session": m.sessions, "file": m.files}


class NotFound(Exception):
    pass


class Invalid(Exception):
    """A well-formed request that refers to something that does not exist (422)."""


class Busy(Exception):
    pass


class Conflict(Exception):
    def __init__(self, message: str, current: dict | None = None):
        super().__init__(message)
        self.current = current


# --- input models ----------------------------------------------------------------------------------------------------
class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    version: int | None = Field(None, ge=1, le=MAX_VERSION)


class SessionIn(BaseModel):
    title: str | None = Field(None, max_length=200)
    project_id: str | None = OptUid
    version: int | None = Field(None, ge=1, le=MAX_VERSION)


class FileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    size: int = Field(0, ge=0)
    kind: str = Field("", max_length=40)
    project_id: str | None = OptUid
    version: int | None = Field(None, ge=1, le=MAX_VERSION)


class Answer(BaseModel, extra="allow"):
    content: str = Field(max_length=60000)
    references: list[dict] = Field([], max_length=100)


class TurnIn(BaseModel):
    idx: int = Field(ge=0, le=MAX_IDX)
    question: str = Field(max_length=4000)
    mode: Mode | None = None
    status: Status
    answer: Answer | None = None
    progress: dict | list | None = None
    plan: dict | list | None = None
    analysis: dict | list | None = None
    refused: str | None = Field(None, max_length=4000)
    error: str | None = Field(None, max_length=4000)
    version: int | None = Field(None, ge=1, le=MAX_VERSION)


def _clip(d: dict, **limits: int) -> dict:
    return {**d, **{k: v[:n] for k, n in limits.items() if isinstance((v := d.get(k)), str)}}


def _when(v: Any) -> datetime | None:
    try:
        return TypeAdapter(datetime).validate_python(v)
    except ValidationError:
        return None


def _row(r) -> dict:
    return {k: v for k, v in r._mapping.items() if k != "owner"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --- change broadcaster ----------------------------------------------------------------------------------------------
class Bus:
    """In-process fan-out of {"type":"changed"} messages.
    ponytail: one process only (main.py runs a single worker); several workers would need Postgres LISTEN/NOTIFY."""
    MAX_LISTENERS = 50

    def __init__(self) -> None:
        self.subs: set[asyncio.Queue] = set()

    def publish(self, entity: str, id: str, version: int | None, **extra: str) -> None:
        msg = {"type": "changed", "entity": entity, "id": id, "version": version, "at": _now().isoformat(), **extra}
        for q in self.subs:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:  # a stalled listener loses messages; it refetches the snapshot on reconnect
                pass

    @asynccontextmanager
    async def subscribe(self):
        if len(self.subs) >= self.MAX_LISTENERS:
            raise Busy("too many listeners")
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self.subs.add(q)
        try:
            yield q
        finally:
            self.subs.discard(q)


class Store:
    def __init__(self, db: Database, bus: Bus, settings: Settings, objects=lambda: None):
        self.db, self.bus, self.settings, self.objects = db, bus, settings, objects
        self.writes: dict[str, deque] = defaultdict(deque)  # client ip -> recent write times (rate limit)

    @asynccontextmanager
    async def tx(self):
        async with self.db.session() as s, s.begin():
            yield s

    def _changed(self, entity: str, r: dict, **extra: str) -> None:
        self.bus.publish(entity, r["id"], r.get("version"), **extra)

    # --- projects / sessions / files: same upsert, soft delete, restore, permanent delete ----------------------------
    async def _get(self, s, t, id: str, lock: bool = True):
        q = sa.select(t).where(t.c.id == id)
        return (await s.execute(q.with_for_update() if lock else q)).first()

    async def upsert(self, entity: str, id: str, values: dict, version: int | None) -> dict:
        t = TABLES[entity]
        async with self.tx() as s:
            if values.get("project_id"):  # an unknown or trashed project is a client error, not a dangling pointer
                p = await self._get(s, m.projects, values["project_id"], lock=False)
                if p is None or p.deleted_at is not None:
                    raise Invalid("project not found")
            for _ in range(2):
                r = await self._get(s, t, id)
                if r is not None:
                    break
                ins = pg_insert(t).values(id=id, **values).on_conflict_do_nothing().returning(t)
                if (r := (await s.execute(ins)).first()) is not None:
                    self._changed(entity, _row(r))
                    return _row(r)
            if r.deleted_at is not None:
                raise Conflict(f"{entity} is in the trash", _row(r))
            if version is not None and version != r.version:
                raise Conflict("version conflict", _row(r))
            upd = {**values, "version": r.version + 1, **({"updated_at": sa.func.now()} if "updated_at" in t.c else {})}
            if entity == "session":
                upd["sort_ts"] = sa.func.now()
            out = _row((await s.execute(sa.update(t).where(t.c.id == id).values(**upd).returning(t))).one())
        self._changed(entity, out)
        return out

    async def soft_delete(self, entity: str, id: str) -> dict:
        t = TABLES[entity]
        moved: list[tuple[str, dict]] = []
        async with self.tx() as s:
            r = await self._get(s, t, id)
            if r is None:
                raise NotFound(entity)
            if r.deleted_at is not None:
                return {"id": id, "deleted": True}
            upd = {"deleted_at": sa.func.now(), "version": r.version + 1,
                   **({"updated_at": sa.func.now()} if "updated_at" in t.c else {})}
            out = _row((await s.execute(sa.update(t).where(t.c.id == id).values(**upd).returning(t))).one())
            if entity == "project":  # its sessions and files go to Personal (no project)
                for child, name in ((m.sessions, "session"), (m.files, "file")):
                    cu = {"project_id": None, "version": child.c.version + 1}
                    if "updated_at" in child.c:
                        cu["updated_at"] = sa.func.now()
                    res = await s.execute(sa.update(child).where(child.c.project_id == id).values(**cu).returning(child.c.id, child.c.version))
                    moved += [(name, {"id": x.id, "version": x.version}) for x in res]
        self._changed(entity, out)
        for name, x in moved:
            self._changed(name, x)
        return {"id": id, "deleted": True, "version": out["version"]}

    async def restore(self, entity: str, id: str) -> dict:
        t = TABLES[entity]
        async with self.tx() as s:
            r = await self._get(s, t, id)
            if r is None:
                raise NotFound(entity)
            if r.deleted_at is None:
                return _row(r)
            upd = {"deleted_at": None, "version": r.version + 1, **({"updated_at": sa.func.now()} if "updated_at" in t.c else {})}
            out = _row((await s.execute(sa.update(t).where(t.c.id == id).values(**upd).returning(t))).one())
        self._changed(entity, out)
        return out

    async def delete_permanent(self, entity: str, id: str) -> None:
        t = TABLES[entity]
        async with self.tx() as s:
            r = await self._get(s, t, id)
            if r is None:
                raise NotFound(entity)
            if r.deleted_at is None:
                raise Conflict(f"{entity} is not in the trash")
            await s.execute(sa.delete(t).where(t.c.id == id))
        if entity == "file":
            await self._drop_objects([id])
        self.bus.publish(entity, id, None)

    async def _drop_objects(self, ids: list[str]) -> None:
        if not ids or (obj := self.objects()) is None:
            return
        for i in ids:
            try:
                await obj.delete(i)
            except Exception:
                log.exception("could not delete object %s", i)

    # --- turns ---------------------------------------------------------------------------------------------------------
    async def put_turn(self, sid: str, tid: str, body: TurnIn) -> dict:
        vals = body.model_dump(exclude={"version"}, mode="json")
        async with self.tx() as s:
            sess = await self._get(s, m.sessions, sid)
            if sess is None or sess.deleted_at is not None:
                raise NotFound("session")
            r = await self._get(s, m.turns, tid)
            try:
                if r is None:
                    ins = pg_insert(m.turns).values(id=tid, session_id=sid, version=body.version or 1, **vals)
                    async with s.begin_nested():  # a clash on (session, idx) rolls back only this insert
                        out = _row((await s.execute(ins.returning(m.turns))).one())
                else:
                    if r.session_id != sid:
                        raise Conflict("turn belongs to another session")
                    if body.version is not None and body.version < r.version:
                        raise Conflict("version conflict", _row(r))
                    upd = {**vals, "version": body.version or r.version + 1, "updated_at": sa.func.now()}
                    async with s.begin_nested():
                        out = _row((await s.execute(sa.update(m.turns).where(m.turns.c.id == tid).values(**upd).returning(m.turns))).one())
            except IntegrityError:
                raise Conflict("another turn already uses this position in the session") from None
            await s.execute(sa.update(m.sessions).where(m.sessions.c.id == sid)
                            .values(updated_at=sa.func.now(), sort_ts=sa.func.now()))
        self._changed("turn", out, session_id=sid)
        return out

    async def truncate_turns(self, sid: str, from_idx: int) -> dict:
        """Remove the turn at `from_idx` and every later one (an edited question replaces them). Idempotent."""
        async with self.tx() as s:
            sess = await self._get(s, m.sessions, sid)
            if sess is None or sess.deleted_at is not None:
                raise NotFound("session")
            gone = (await s.execute(sa.delete(m.turns).where(m.turns.c.session_id == sid, m.turns.c.idx >= from_idx)
                                    .returning(m.turns.c.id))).all()
            if gone:
                await s.execute(sa.update(m.sessions).where(m.sessions.c.id == sid)
                                .values(updated_at=sa.func.now(), sort_ts=sa.func.now(), version=m.sessions.c.version + 1))
                sess = await self._get(s, m.sessions, sid)
        if gone:
            self._changed("session", _row(sess))  # others refetch the session (and its remaining turns)
        return {"removed": len(gone)}

    # --- reads ---------------------------------------------------------------------------------------------------------
    async def snapshot(self, limit_sessions: int) -> dict:
        await self.purge()
        limit = max(1, min(limit_sessions, self.settings.store_max_sessions))
        async with self.db.session() as s:
            alive = lambda t: t.c.deleted_at.is_(None)  # noqa: E731
            projects = [_row(r) for r in await s.execute(sa.select(m.projects).where(alive(m.projects)).order_by(m.projects.c.created_at).limit(MAX_PROJECTS))]
            sessions = [_row(r) for r in await s.execute(sa.select(m.sessions).where(alive(m.sessions)).order_by(m.sessions.c.updated_at.desc()).limit(limit))]
            by_id = {x["id"]: {**x, "turns": []} for x in sessions}
            if by_id:
                q = sa.select(m.turns).where(m.turns.c.session_id.in_(list(by_id))).order_by(m.turns.c.session_id, m.turns.c.idx)
                for r in await s.execute(q):
                    by_id[str(r.session_id)]["turns"].append(_row(r))
            files = [_row(r) for r in await s.execute(sa.select(m.files).where(alive(m.files)).order_by(m.files.c.added_at.desc()).limit(MAX_FILES))]
            now = (await s.execute(sa.select(sa.func.now()))).scalar_one()
        return {"projects": projects, "sessions": list(by_id.values()), "files": files, "server_time": now}

    async def trash(self) -> dict:
        async with self.db.session() as s:
            cut = sa.func.now() - sa.func.make_interval(0, 0, 0, sa.cast(self.settings.trash_days, sa.Integer))
            out = {}
            for key, t in (("projects", m.projects), ("sessions", m.sessions), ("files", m.files)):
                q = sa.select(t).where(t.c.deleted_at.is_not(None), t.c.deleted_at >= cut).order_by(t.c.deleted_at.desc()).limit(MAX_FILES)
                out[key] = [_row(r) for r in await s.execute(q)]
        return out

    async def purge(self) -> dict:
        """Remove what has been in the trash longer than trash_days (files' objects too)."""
        cut = sa.func.now() - sa.func.make_interval(0, 0, 0, sa.cast(self.settings.trash_days, sa.Integer))
        async with self.tx() as s:
            out = {}
            fids: list[str] = []
            for key, t in (("sessions", m.sessions), ("projects", m.projects), ("files", m.files)):
                ids = [r.id for r in await s.execute(sa.delete(t).where(t.c.deleted_at < cut).returning(t.c.id))]
                out[key] = len(ids)
                if key == "files":
                    fids = ids
        await self._drop_objects(fids)
        return out

    # --- one-shot import of the browser's old data ---------------------------------------------------------------------
    async def import_all(self, raw: dict) -> dict:
        cfg = self.settings
        n = dict(projects=0, sessions=0, turns=0, files=0, skipped=0)

        def items(key: str, limit: int) -> list[dict]:
            v = raw.get(key)
            v = [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []
            n["skipped"] += max(0, len(v) - limit)
            return v[:limit]

        def ok(model, d: dict, pattern: str | None = None) -> BaseModel | None:
            if pattern and not _id(d, pattern):
                n["skipped"] += 1
                return None
            try:
                return model.model_validate(d)
            except ValidationError:
                n["skipped"] += 1
                return None

        async def ins(s, t, rows: list[dict]) -> set[str]:
            done: set[str] = set()
            for i in range(0, len(rows), 200):
                res = await s.execute(pg_insert(t).values(rows[i:i + 200]).on_conflict_do_nothing().returning(t.c.id))
                done |= {str(x.id) for x in res}
            return done

        def stamps(d: dict) -> dict:
            c = _when(d.get("created_at")) or _now()
            return {"created_at": c, "updated_at": _when(d.get("updated_at")) or c}

        projs, sess, files = items("projects", MAX_PROJECTS), items("sessions", cfg.store_max_sessions), items("files", MAX_FILES)
        async with self.tx() as s:
            rows = []
            for d in projs:
                if p := ok(ProjectIn, _clip(d, name=120), UUID_RE):
                    rows.append({"id": d["id"], "name": p.name, **stamps(d)})
            new_proj = await ins(s, m.projects, rows)
            n["projects"] = len(new_proj)
            known = {str(r.id) for r in await s.execute(sa.select(m.projects.c.id).where(m.projects.c.deleted_at.is_(None)))}
            srows, turn_rows = [], []
            for d in sess:
                if not (p := ok(SessionIn, _clip({**d, "project_id": d.get("project_id") if d.get("project_id") in known else None}, title=200), UUID_RE)):
                    continue
                srows.append({"id": d["id"], "title": p.title, "project_id": p.project_id, **stamps(d)})
                tl = d.get("turns") if isinstance(d.get("turns"), list) else []
                n["skipped"] += max(0, len(tl) - MAX_TURNS)
                for i, td in enumerate(x for x in tl[:MAX_TURNS] if isinstance(x, dict)):
                    td = _clip({**td, "idx": td.get("idx", i)}, question=4000, refused=4000, error=4000)
                    if isinstance(a := td.get("answer"), dict) and isinstance(a.get("content"), str):
                        td["answer"] = {**a, "content": a["content"][:60000], "references": (a.get("references") or [])[:100]
                                        if isinstance(a.get("references"), list) else []}
                    if t := ok(TurnIn, td):
                        tid = td["id"] if _id(td, UUID_RE) else str(uuidlib.uuid4())
                        turn_rows.append({"id": tid, "session_id": d["id"], **t.model_dump(exclude={"version"}, mode="json"), **stamps(td)})
            new_sess = await ins(s, m.sessions, srows)
            n["sessions"] = len(new_sess)
            n["turns"] = len(await ins(s, m.turns, [r for r in turn_rows if r["session_id"] in new_sess]))
            frows = []
            for d in files:
                if p := ok(FileIn, _clip({**d, "project_id": d.get("project_id") if d.get("project_id") in known else None}, name=120, kind=40), FILE_RE):
                    frows.append({"id": d["id"], "name": p.name, "size": p.size, "kind": p.kind, "project_id": p.project_id,
                                  "added_at": _when(d.get("added_at")) or _now()})
            new_files = await ins(s, m.files, frows)
            n["files"] = len(new_files)
        for ent, ids in (("project", new_proj), ("session", new_sess), ("file", new_files)):
            for i in ids:
                self.bus.publish(ent, i, 1)
        return n


def _id(d: dict, pattern: str) -> bool:
    return isinstance(d.get("id"), str) and re.fullmatch(pattern, d["id"]) is not None

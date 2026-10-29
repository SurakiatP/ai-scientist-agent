"""Fair run queue over the runs table (shared by every process): two pools (research, analysis). Admission, the fair order,
position and ETA are computed from rows; a claim moves one queued row to running under a per-pool advisory lock, so the
global and per-client caps are exact however many processes compete.
The client id is used only to share slots fairly and to cap one browser; it is never an identity or a permission here."""
import math
from collections.abc import AsyncIterator
from datetime import datetime, timezone

import sqlalchemy as sa

from scientist import models as m
from scientist.config import Settings

MIN_COUNTED_SECONDS = 5  # shorter runs (refusals, instant errors) would drag the ETA average down
DEFAULT_SECONDS = {"research": 180, "analysis": 60}  # ETA average before any run has finished in this pool
LOCK_ADMIT = 7300  # advisory lock keys: admission, then one per pool
LOCKS = {"research": 7301, "analysis": 7302}
NEVER = datetime.min.replace(tzinfo=timezone.utc)


class Rejected(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


class Ticket:
    """The pipeline's `gate` for a run that was already granted its slot: acquire() yields no position, release() ends it."""

    def __init__(self, run_id: str, client_id: str, pool: str):
        self.run_id, self.client_id, self.pool = run_id, client_id, pool
        self.state = "running"

    async def acquire(self) -> AsyncIterator[int]:
        return
        yield  # an empty async generator: the slot is already held

    def release(self) -> None:
        self.state = "closed"

    close = release


def fair_order(queued: list[dict], served: dict, running: dict, per_client: int) -> list[dict]:
    """Queued rows in the order slots will go to them: least recently served client first, then oldest; a client already
    at its running limit waits for the next round (rounds assume the picked runs finish). `served`: client -> last claim
    time, `running`: client -> runs running now (both pools)."""
    key = lambda r: (served.get(r["client_id"]) or NEVER, r["created_at"], r["id"])  # noqa: E731
    rest, order = list(queued), []
    load = {r["client_id"]: running.get(r["client_id"], 0) for r in rest}
    while rest:
        picked = []
        for r in sorted(rest, key=key):
            if load[r["client_id"]] < per_client:
                load[r["client_id"]] += 1
                picked.append(r)
        if not picked:
            load = dict.fromkeys(load, 0)
            continue
        order += picked
        rest = [r for r in rest if r not in picked]
        load = dict.fromkeys(load, 0)
    return order


class RunQueue:
    def __init__(self, settings: Settings, db=None):
        self.limits = {"research": settings.max_concurrent_runs, "analysis": settings.sandbox_max_concurrent}
        self.per_client = settings.max_running_per_client
        self.queued_cap = settings.max_queued_per_client
        self.queue_max = settings.run_queue_max
        self.db = db

    # --- admission ---------------------------------------------------------------------------------------------------
    async def admit(self, client_id: str, s=None) -> None:
        """Submit-time caps; raises Rejected. A client holds at most MAX_RUNNING running plus MAX_QUEUED waiting runs
        (checked as one count), and the queue holds RUN_QUEUE_MAX. Counted in Postgres, globally; with `s` (the submit's
        transaction) under the admission lock so two processes cannot both take the last place."""
        if s is None:
            async with self.db.session() as s2, s2.begin():
                return await self.admit(client_id, s2)
        await s.execute(sa.text("select pg_advisory_xact_lock(:k)"), {"k": LOCK_ADMIT})
        mine, waiting = (await s.execute(sa.text(
            "select count(*) filter (where client_id = :c), count(*) filter (where status = 'queued') "
            "from runs where status in ('queued', 'running')"), {"c": client_id})).one()
        if mine >= self.queued_cap + self.per_client:
            raise Rejected("client_busy", "you already have as many runs waiting as allowed")
        if waiting >= self.queue_max:
            raise Rejected("queue_full", "the queue is full; try again shortly")

    # --- scheduling --------------------------------------------------------------------------------------------------
    async def _state(self, s, pool: str) -> tuple[list[dict], dict]:
        """(queued rows of the pool in fair order, running per client over both pools)."""
        c = m.runs.c
        queued = [dict(r._mapping) for r in await s.execute(
            sa.select(c.id, c.client_id, c.created_at).where(c.status == "queued", c.pool == pool))]
        clients = {r["client_id"] for r in queued}
        if not clients:
            return [], {}
        served = dict((await s.execute(sa.select(c.client_id, sa.func.max(c.served_at))
                                       .where(c.client_id.in_(clients)).group_by(c.client_id))).all())
        running = dict((await s.execute(sa.select(c.client_id, sa.func.count())
                                        .where(c.status == "running", c.client_id.in_(clients)).group_by(c.client_id))).all())
        return fair_order(queued, served, running, self.per_client), running

    async def claim(self, s, pool: str, worker: str, lease_seconds: int) -> dict | None:
        """In the caller's transaction: move the next fair queued run of the pool to running for `worker`, or None
        (pool full, nothing queued, or the next one is locked by a concurrent cancel)."""
        await s.execute(sa.text("select pg_advisory_xact_lock(:k)"), {"k": LOCKS[pool]})
        c = m.runs.c
        if (await s.execute(sa.select(sa.func.count()).where(c.status == "running", c.pool == pool))).scalar_one() >= self.limits[pool]:
            return None
        order, running = await self._state(s, pool)
        # the per-client cap counts both pools, and another pool may have claimed since the order was computed
        nxt = next((r for r in order if running.get(r["client_id"], 0) < self.per_client), None)
        if nxt is None:
            return None
        pick = sa.select(c.id).where(c.id == nxt["id"], c.status == "queued").with_for_update(skip_locked=True).scalar_subquery()
        row = (await s.execute(sa.update(m.runs).where(c.id == pick).values(
            status="running", worker=worker, started_at=sa.func.now(), served_at=sa.func.now(),
            lease_until=sa.func.now() + sa.func.make_interval(0, 0, 0, 0, 0, 0, lease_seconds)).returning(m.runs))).first()
        return dict(row._mapping) if row else None

    async def position(self, s, row: dict) -> int:
        order, _ = await self._state(s, row["pool"])
        return next((i + 1 for i, r in enumerate(order) if r["id"] == row["id"]), 0)

    # --- reporting ---------------------------------------------------------------------------------------------------
    async def eta(self, s, pool: str, position: int) -> int:
        """Average of the last 20 done/error runs of the pool that held a slot at least MIN_COUNTED_SECONDS."""
        c = m.runs.c
        secs = sa.func.extract("epoch", c.finished_at - c.started_at)
        d = [float(x) for x in (await s.execute(
            sa.select(secs).where(c.pool == pool, c.status.in_(("done", "error")), c.finished_at.is_not(None),
                                  c.started_at.is_not(None), secs >= MIN_COUNTED_SECONDS)
            .order_by(c.finished_at.desc()).limit(20))).scalars()]
        avg = sum(d) / len(d) if d else DEFAULT_SECONDS[pool]
        return math.ceil(position / self.limits[pool]) * round(avg)

    async def status(self) -> dict:
        c = m.runs.c
        async with self.db.session() as s:
            rows = (await s.execute(sa.select(c.pool, c.status, sa.func.count()).where(c.status.in_(("queued", "running")))
                                    .group_by(c.pool, c.status))).all()
        n = {(p, st): k for p, st, k in rows}
        return {p: {"running": n.get((p, "running"), 0), "limit": lim, "queued": n.get((p, "queued"), 0)}
                for p, lim in self.limits.items()}

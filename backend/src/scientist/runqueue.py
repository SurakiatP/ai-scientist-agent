"""Fair run queue: two pools (research, analysis), one ticket per run. A ticket has RunGate's acquire()/release()
interface, so pipeline.ask and the analyze path take it as their `gate` unchanged.
The client id is used only to share slots fairly and to cap one browser; it is never an identity or a permission here."""
import asyncio
import itertools
import math
import time
from collections import deque
from collections.abc import AsyncIterator

from scientist.config import Settings

MIN_COUNTED_SECONDS = 5  # shorter runs (refusals, instant errors) would drag the ETA average down
DEFAULT_SECONDS = {"research": 180, "analysis": 60}  # ETA average before any run has finished in this process


class Rejected(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


class Ticket:
    def __init__(self, queue: "RunQueue", run_id: str, client_id: str, pool: str, seq: int):
        self.q, self.run_id, self.client_id, self.pool, self.seq = queue, run_id, client_id, pool, seq
        self.state = "new"  # new (counts against caps, not yet waiting) -> queued -> running -> closed
        self.started_at: float | None = None
        self.on_start = None  # called (sync) the moment a slot is granted
        self.held: float | None = None  # seconds it held a slot; the run service feeds it to the ETA once the outcome is known

    @property
    def position(self) -> int:
        return self.q.position(self) if self.state == "queued" else 0

    def eta(self, position: int | None = None) -> int:
        return self.q.eta(self.pool, position or self.position)

    async def acquire(self) -> AsyncIterator[int]:
        """Yields the 1-based position whenever it changes; when the iteration ends the caller holds a slot and
        must call release(). Closing or cancelling it early takes no slot."""
        q = self.q
        if self.state == "new":
            self.state = "queued"
            q._pump()
        done = False
        try:
            last = 0
            while self.state == "queued":
                if (pos := q.position(self)) != last:
                    last = pos
                    yield pos
                    continue  # the caller awaited: state may have moved, check again
                await q._changed.wait()
            done = self.state == "running"
        finally:
            if not done:
                self.close()

    def release(self) -> None:
        self.close()

    def close(self) -> None:
        """Idempotent: leave the queue, or give the slot back (a refused or cancelled run never acquired)."""
        if self.state == "closed":
            return
        was_running, self.state = self.state == "running", "closed"
        if was_running:
            self.q._finish(self)
        self.q._tickets.discard(self)
        self.q._pump()


class RunQueue:
    def __init__(self, settings: Settings):
        self.limits = {"research": settings.max_concurrent_runs, "analysis": settings.sandbox_max_concurrent}
        self.per_client = settings.max_running_per_client
        self.queued_cap = settings.max_queued_per_client
        self.queue_max = settings.run_queue_max
        self._tickets: set[Ticket] = set()
        self._seq = itertools.count()
        self._changed = asyncio.Event()
        self._durations = {p: deque(maxlen=20) for p in self.limits}  # seconds of the last finished runs, per pool
        self._served: dict[str, int] = {}  # client -> tick of its latest slot grant (least recently served goes first)
        self._tick = itertools.count()

    # --- admission ---------------------------------------------------------------------------------------------------
    def admit(self, client_id: str) -> None:
        """Submit-time caps; raises Rejected. A client holds at most MAX_RUNNING running plus MAX_QUEUED waiting tickets
        (3 by default; with nothing running it is still that total), checked as one count. Call right before ticket() with no await between."""
        mine = [t for t in self._tickets if t.client_id == client_id]
        waiting = lambda ts: sum(t.state in ("new", "queued") for t in ts)  # noqa: E731
        if len(mine) >= self.queued_cap + self.per_client:
            raise Rejected("client_busy", "you already have as many runs waiting as allowed")
        if waiting(self._tickets) >= self.queue_max:
            raise Rejected("queue_full", "the queue is full; try again shortly")

    def ticket(self, run_id: str, client_id: str, pool: str) -> Ticket:
        t = Ticket(self, run_id, client_id, pool, next(self._seq))
        self._tickets.add(t)
        return t

    # --- scheduling --------------------------------------------------------------------------------------------------
    def _running(self, pool: str | None = None, client: str | None = None) -> int:
        return sum(t.state == "running" and (pool is None or t.pool == pool) and (client is None or t.client_id == client)
                   for t in self._tickets)

    def _order(self, pool: str) -> list[Ticket]:
        """Queued tickets in the order slots will go to them: least recently served client first, then oldest
        enqueue; a client already at its running limit waits for the next round (rounds assume the picked runs finish)."""
        rest = [t for t in self._tickets if t.pool == pool and t.state == "queued"]
        key = lambda t: (self._served.get(t.client_id, -1), t.seq)  # noqa: E731
        load = {t.client_id: self._running(client=t.client_id) for t in rest}
        order: list[Ticket] = []
        while rest:
            picked = []
            for t in sorted(rest, key=key):
                if load[t.client_id] < self.per_client:
                    load[t.client_id] += 1
                    picked.append(t)
            if not picked:
                load = dict.fromkeys(load, 0)
                continue
            order += picked
            rest = [t for t in rest if t not in picked]
            load = dict.fromkeys(load, 0)
        return order

    def position(self, t: Ticket) -> int:
        order = self._order(t.pool)
        return order.index(t) + 1 if t in order else 0

    def _pump(self) -> None:
        for pool, limit in self.limits.items():
            while self._running(pool) < limit:
                nxt = next((t for t in self._order(pool) if self._running(client=t.client_id) < self.per_client), None)
                if nxt is None:
                    break
                nxt.state, nxt.started_at = "running", time.monotonic()
                self._served[nxt.client_id] = next(self._tick)
                if nxt.on_start:
                    nxt.on_start()
        self._changed.set()
        self._changed = asyncio.Event()

    def _finish(self, t: Ticket) -> None:
        if t.started_at is not None:
            t.held = time.monotonic() - t.started_at

    def record(self, t: Ticket) -> None:
        """A run that ended done/error after holding its slot long enough teaches the ETA (called once, after close)."""
        if t.held is not None and t.held >= MIN_COUNTED_SECONDS:
            self._durations[t.pool].append(t.held)

    # --- reporting ---------------------------------------------------------------------------------------------------
    def eta(self, pool: str, position: int) -> int:
        d = self._durations[pool]
        avg = sum(d) / len(d) if d else DEFAULT_SECONDS[pool]
        return math.ceil(position / self.limits[pool]) * round(avg)

    def status(self) -> dict:
        return {p: {"running": self._running(p), "limit": n,
                    "queued": sum(t.pool == p and t.state in ("new", "queued") for t in self._tickets)}
                for p, n in self.limits.items()}

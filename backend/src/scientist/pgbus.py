"""Cross-process notifications over Postgres LISTEN/NOTIFY: one dedicated listener connection per process.

Payloads carry ids, sequence numbers and store-change JSON only, never secrets or request bodies. A notification is
a wake-up hint: after GAP (the listener (re)connected), whatever was sent meanwhile is lost, so the consumer re-reads the tables.
"""
import asyncio
import logging
from contextlib import asynccontextmanager, suppress

import psycopg
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from scientist.config import Settings
from scientist.db import Database, build_url

log = logging.getLogger(__name__)
CHANNELS = ("runs", "run_events", "run_cancel", "store_changes")
MAX_PAYLOAD_BYTES = 7900  # Postgres refuses 8000 and over
QUEUE_MAX = 200  # per subscriber; a slower consumer is told GAP and re-reads
BACKOFF = (0.5, 10.0)  # first retry, cap (doubles in between)


class _Gap:
    def __repr__(self) -> str:
        return "GAP"


GAP = _Gap()  # yielded by a subscription after the listener reconnected: compare with `is GAP`


class _Subscription:  # a class, not a generator: a cancelled wait (timeout) must not end the iteration
    def __init__(self, q: asyncio.Queue):
        self._q = q

    def __aiter__(self):
        return self

    async def __anext__(self):
        return await self._q.get()


def _check(channel: str, payload: str) -> None:
    if channel not in CHANNELS:
        raise ValueError(f"unknown channel {channel!r}")
    if len(payload.encode()) > MAX_PAYLOAD_BYTES:
        raise ValueError(f"notification payload over {MAX_PAYLOAD_BYTES} bytes")


class PgBus:
    def __init__(self, settings: Settings, db: Database):
        u = build_url(settings)  # same URL and password resolution as the engine
        self._db = db  # notify() goes through its pool; the dedicated connection below only listens
        self._conninfo = psycopg.conninfo.make_conninfo(**{
            "host": u.host, "port": u.port, "user": u.username, "password": u.password, "dbname": u.database,
            **{k: v for k, v in u.query.items() if isinstance(v, str)},  # e.g. sslmode
            # the bus's own settings come last and win over a same-named URL parameter
            "connect_timeout": settings.db_connect_timeout_s, "options": "-c idle_session_timeout=0",  # prod sets 10 min
            "keepalives": 1, "keepalives_idle": 30, "keepalives_interval": 10, "keepalives_count": 3})
        self._subs: dict[str, set[asyncio.Queue]] = {c: set() for c in CHANNELS}
        self._task: asyncio.Task | None = None
        self._up = asyncio.Event()
        self.backend_pid: int | None = None  # the listener connection's server process (tests, diagnostics)

    async def start(self) -> None:
        """Begin listening; waits briefly for the first connection but never fails when the database is down."""
        self._task = asyncio.create_task(self._listen())
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(self._up.wait(), 5)

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _listen(self) -> None:
        delay = BACKOFF[0]
        while True:
            try:
                async with await psycopg.AsyncConnection.connect(self._conninfo, autocommit=True) as conn:
                    for c in CHANNELS:
                        await conn.execute(f"LISTEN {c}")
                    self.backend_pid, delay = conn.info.backend_pid, BACKOFF[0]
                    self._up.set()
                    self._fan(GAP)  # also after the first connect: a subscriber may have waited through an outage
                    async for n in conn.notifies():
                        self._fan(n.payload, n.channel)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.warning("notification listener down (%s), retrying in %.1fs", type(e).__name__, delay)
            self._up.clear()
            self.backend_pid = None
            await asyncio.sleep(delay)
            delay = min(delay * 2, BACKOFF[1])

    def _fan(self, item, channel: str | None = None) -> None:
        for ch in (CHANNELS if channel is None else (channel,)):
            for q in self._subs[ch]:
                try:
                    q.put_nowait(item)
                except asyncio.QueueFull:
                    while not q.empty():
                        q.get_nowait()
                    q.put_nowait(GAP)

    @asynccontextmanager
    async def subscribe(self, channel: str):
        """`async with bus.subscribe(ch) as it` -> async iterator of payload strings, and GAP after a reconnect."""
        if channel not in CHANNELS:
            raise ValueError(f"unknown channel {channel!r}")
        q: asyncio.Queue = asyncio.Queue(QUEUE_MAX)
        self._subs[channel].add(q)

        try:
            yield _Subscription(q)
        finally:
            self._subs[channel].discard(q)

    async def notify(self, channel: str, payload: str, session: AsyncSession | None = None) -> None:
        """With a session the notification is delivered when that transaction commits (never on rollback)."""
        _check(channel, payload)
        if session is not None:
            await session.execute(text("select pg_notify(:c, :p)"), {"c": channel, "p": payload})
            return
        async with self._db.engine.begin() as conn:  # pooled: statement_timeout and the 503 handler apply
            await conn.execute(text("select pg_notify(:c, :p)"), {"c": channel, "p": payload})

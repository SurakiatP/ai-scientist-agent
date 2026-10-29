"""The fair queue over the runs table: admission, claim order, position, ETA (needs the throwaway Postgres)."""
import uuid

import pytest
import sqlalchemy as sa
from alembic import command

from scientist.config import Settings, get_settings
from scientist.db import open_database
from scientist.runqueue import Rejected, RunQueue, Ticket
from test_config import ENV
from test_db import _alembic, newdb, pg  # noqa: F401


@pytest.fixture(autouse=True)
def _env(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
async def mk(newdb):  # noqa: F811
    command.upgrade(_alembic(), "head")
    made = []

    def make(**kw):
        kw.setdefault("max_running_per_client", 1)  # the fairness tests below are about a tight per-client cap; the defaults are tested separately
        kw.setdefault("max_queued_per_client", 2)
        db = open_database(get_settings())
        made.append(db)
        return Q(RunQueue(Settings(openrouter_api_key="k", model="m", fallback_model="f", hermes_source_path=".", hermes_revision="x", **kw), db))
    yield make
    for db in made:
        await db.close()


class Q:
    """A queue plus helpers that act like the run service: enqueue, claim, finish."""

    def __init__(self, q):
        self.q, self.db, self.n = q, q.db, 0

    async def add(self, client, pool="research"):
        rid = str(uuid.uuid4())
        self.n += 1
        async with self.db.session() as s, s.begin():
            await s.execute(sa.text("insert into runs(id, client_id, kind, status, pool) values (:i, :c, 'ask', 'queued', :p)"),
                            {"i": rid, "c": client, "p": pool})
        return rid

    async def claim(self, pool="research"):
        async with self.db.session() as s, s.begin():
            row = await self.q.claim(s, pool, "w", 30)
        return str(row["id"]) if row else None

    async def claim_all(self):
        got = []
        for pool in self.q.limits:
            while (rid := await self.claim(pool)):
                got.append(rid)
        return got

    async def end(self, rid, status="done", secs=None):
        async with self.db.session() as s, s.begin():
            await s.execute(sa.text("update runs set status = :st, finished_at = now(), started_at = coalesce(started_at, now()) - make_interval(secs => :n) "
                                    "where id = :i"), {"st": status, "i": rid, "n": secs or 0})

    async def position(self, rid):
        async with self.db.session() as s:
            row = dict((await s.execute(sa.text("select id::text as id, pool from runs where id = :i"), {"i": rid})).one()._mapping)
            return await self.q.position(s, row)

    async def eta(self, pool, position):
        async with self.db.session() as s:
            return await self.q.eta(s, pool, position)


async def test_other_client_starts_before_a_clients_second_and_third(mk):
    q = mk(max_concurrent_runs=2)
    a1, a2, a3 = [await q.add("A") for _ in range(3)]
    b1 = await q.add("B")
    assert await q.claim_all() == [a1, b1]  # A holds one slot, B gets the other
    assert await q.q.status() == {"research": {"running": 2, "limit": 2, "queued": 2}, "analysis": {"running": 0, "limit": 3, "queued": 0}}


async def test_per_client_running_limit_is_across_pools(mk):
    q = mk(max_concurrent_runs=4, sandbox_max_concurrent=3)
    r1, r2, an = await q.add("A"), await q.add("A"), await q.add("A", "analysis")
    assert await q.claim_all() == [r1]
    await q.end(r1)
    assert await q.claim_all() == [r2]  # earliest enqueue goes first
    await q.end(r2)
    assert await q.claim_all() == [an]


async def test_limit_one_serves_the_least_recently_served_client_first(mk):
    q = mk(max_concurrent_runs=1)
    a1, a2, a3, b1 = await q.add("A"), await q.add("A"), await q.add("A"), await q.add("B")
    assert await q.claim_all() == [a1]
    assert [await q.position(r) for r in (b1, a2, a3)] == [1, 2, 3]  # positions follow the same order
    c1 = await q.add("C")  # joins later, never served
    assert [await q.position(r) for r in (b1, c1, a2, a3)] == [1, 2, 3, 4]
    order = [a1]
    for want in (b1, c1, a2, a3):
        await q.end(order[-1])
        assert await q.claim_all() == [want]
        order.append(want)
    assert order == [a1, b1, c1, a2, a3]


async def test_limit_one_a_then_b_runs_a1_b1_a2_a3(mk):
    q = mk(max_concurrent_runs=1)
    a1, a2, a3, b1 = await q.add("A"), await q.add("A"), await q.add("A"), await q.add("B")
    ran = []
    for _ in range(4):
        (rid,) = await q.claim_all()
        ran.append(rid)
        await q.end(rid)
    assert ran == [a1, b1, a2, a3]


async def test_a_cancelled_waiter_moves_the_others_up(mk):
    q = mk(max_concurrent_runs=1)
    await q.add("A")
    a2, a3, b1 = await q.add("A"), await q.add("A"), await q.add("B")
    await q.claim_all()
    assert (await q.position(b1), await q.position(a2), await q.position(a3)) == (1, 2, 3)  # A is at its limit: B first
    await q.end(b1, "stopped")  # B gives up while waiting
    assert (await q.position(a2), await q.position(a3)) == (1, 2)
    assert (await q.q.status())["research"]["queued"] == 2


async def test_two_queues_never_exceed_the_global_limit(mk):
    a, b = mk(max_concurrent_runs=1), mk(max_concurrent_runs=1)  # two processes
    for c in ("A", "B", "C"):
        await a.add(c)
    got = [x for x in [await a.claim(), await b.claim(), await a.claim()] if x]
    assert len(got) == 1


async def test_eta_uses_default_then_average_of_finished_runs(mk):
    q = mk(max_concurrent_runs=2, sandbox_max_concurrent=3)
    assert await q.eta("research", 1) == 180 and await q.eta("research", 3) == 2 * 180 and await q.eta("analysis", 4) == 2 * 60
    r = await q.add("A")
    await q.claim()
    await q.end(r, "done", 100)  # it ran for 100 s
    assert await q.eta("research", 1) == 100 and await q.eta("research", 2) == 100 and await q.eta("analysis", 1) == 60  # pools are separate


async def test_eta_ignores_short_and_non_done_runs(mk):
    q = mk(max_concurrent_runs=1)
    for secs, status in ((2, "done"), (100, "stopped"), (100, "refused")):  # too short; stopped; refused
        await q.add("A")
        rid = await q.claim()
        await q.end(rid, status, secs)
    assert await q.eta("research", 1) == 180


async def test_caps_client_busy_and_queue_full(mk):
    q = mk(max_concurrent_runs=1, run_queue_max=3)
    ids = []
    for _ in range(3):  # 1 running + 2 queued is the most one client may have
        await q.q.admit("A")
        ids.append(await q.add("A"))
    with pytest.raises(Rejected) as e:
        await q.q.admit("A")
    assert e.value.code == "client_busy"
    await q.claim()
    await q.q.admit("B")  # 2 queued so far (A's), room for one more
    await q.add("B")
    with pytest.raises(Rejected) as e:
        await q.q.admit("C")
    assert e.value.code == "queue_full"
    await q.end(ids[0])  # a slot frees...
    await q.claim()  # ...the next one runs: the queue shrinks, C fits again
    await q.q.admit("C")


async def test_default_limits_let_one_browser_run_several_sessions_side_by_side(mk):
    s = Settings(openrouter_api_key="k", model="m", fallback_model="f", hermes_source_path=".", hermes_revision="x")
    assert (s.max_running_per_client, s.max_queued_per_client) == (3, 1)
    q = mk(max_running_per_client=3, max_concurrent_runs=4)
    ids = [await q.add("A") for _ in range(4)]
    assert await q.claim_all() == ids[:3]  # three at once; the fourth waits for one of them
    await q.end(ids[0])
    assert await q.claim_all() == [ids[3]]


async def test_a_granted_ticket_has_the_gate_interface_and_yields_no_position():
    t = Ticket("r", "A", "research")
    assert [p async for p in t.acquire()] == []
    t.release()
    assert t.state == "closed"

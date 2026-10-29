"""Two RunService instances on one Postgres (fake pipelines) stand for two backend processes."""
import asyncio
import uuid
from collections import defaultdict
from types import SimpleNamespace

import pytest
from alembic import command

from scientist.config import get_settings
from scientist.db import open_database
from scientist.events import Complete, FinalAnswer, Sources, Strategy
from scientist.pgbus import PgBus
from scientist.routes_runs import RunIn
from scientist.runqueue import Rejected, RunQueue
from scientist.runs import RunService
from scientist.store import Bus, Store
from test_config import ENV
from test_db import _alembic, newdb, pg  # noqa: F401
from test_store import sql

u = lambda: str(uuid.uuid4())  # noqa: E731


@pytest.fixture(autouse=True)
def _env(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class Fake:
    """The fake pipeline: Strategy, N Sources, then waits for release(run id), then answers."""

    def __init__(self, n=0, pause=0.0):
        self.gates, self.ran, self.cancelled, self.n, self.pause = defaultdict(asyncio.Event), [], [], n, pause

    def release(self, rid):
        self.gates[rid].set()

    async def script(self, svc, run):
        self.ran.append((svc.pid, run.id))
        try:
            yield Strategy(reasoning="r", searches=[])
            for i in range(self.n):
                await asyncio.sleep(self.pause)
                yield Sources(term=f"t{i}", papers=[])
            await self.gates[run.id].wait()
            yield FinalAnswer(content="a", references=[])
            yield Complete()
        except asyncio.CancelledError:
            self.cancelled.append(run.id)
            raise


@pytest.fixture
async def cluster(newdb):  # noqa: F811
    command.upgrade(_alembic(), "head")
    fake, made = Fake(), []

    async def make(start=True, **kw):
        s = get_settings().model_copy(update={"run_lease_seconds": 5, "scheduler_poll_seconds": 0.2, **kw})
        db = open_database(s)
        bus = PgBus(s, db)
        await bus.start()
        st = SimpleNamespace(settings=s, db=db, pgbus=bus, store=None, runner=None, client=None)
        svc = RunService(st, Store(db, Bus(), s), RunQueue(s, db))
        svc._generator = lambda run: fake.script(svc, run)
        made.append(svc)
        if start:
            await svc.startup()
        return svc

    fake.make, fake.db = make, newdb
    yield fake
    for svc in made:
        await svc.shutdown()
        await svc.st.pgbus.stop()
        await svc.st.db.close()


async def submit(fake, svc, sid, cid, **kw):
    sql(fake.db, "insert into sessions(id, title) values (%s, 't') on conflict do nothing", sid)
    body = RunIn(session_id=sid, turn_id=u(), kind="ask", question="What does base editing change?", mode="deep", **kw)
    return (await svc.submit(body, cid))["run"]["id"]


async def until(cond, t=15):
    for _ in range(int(t / 0.05)):
        if await cond():
            return
        await asyncio.sleep(0.05)
    raise AssertionError("condition never held")


def ran(fake, n):
    async def f():
        return len(fake.ran) >= n
    return f


def is_status(fake, rid, want):
    async def f():
        return sql(fake.db, "select status from runs where id = %s", rid)[0][0] == want
    return f


async def die(svc):
    """A process death: nothing is written any more (no final write, no lease renewal)."""
    async def nothing(*a, **k):
        return None
    svc._finalize = nothing
    for t in svc._loops:
        t.cancel()
    tasks = [r.task for r in svc.live.values()]
    for t in tasks:
        t.cancel()
    await asyncio.gather(*svc._loops, *tasks, return_exceptions=True)
    svc._loops = []


async def follow(svc, rid, after=0):
    seen = []
    async for seq, ev in svc.events(rid, after, 0.2):
        if seq is not None:
            seen.append((seq, ev["type"]))
    return seen


async def test_rf1_one_running_at_a_time_across_processes_in_fair_order(cluster):
    a, b = await cluster.make(max_concurrent_runs=1), await cluster.make(max_concurrent_runs=1)
    sid = u()
    r1 = await submit(cluster, a, sid, "c1")
    r2 = await submit(cluster, b, sid, "c1")
    r3 = await submit(cluster, a, sid, "c2")
    order = []
    for _ in range(3):
        await until(ran(cluster, len(order) + 1))
        rid = cluster.ran[len(order)][1]
        order.append(rid)
        assert sql(cluster.db, "select count(*) from runs where status = 'running'") == [(1,)]
        await asyncio.sleep(0.5)  # the other process would have claimed by now if it could
        assert len(cluster.ran) == len(order)
        cluster.release(rid)
        await until(is_status(cluster, rid, "done"))
    assert order == [r1, r3, r2]  # c1 was served first: c2 goes before c1's second


async def test_rf2_dead_owner_is_restarted_once_then_interrupted(cluster):
    fake = cluster
    a = await fake.make(max_concurrent_runs=1)
    rid = await submit(fake, a, u(), "c1")
    await until(ran(fake, 1))
    b = await fake.make(max_concurrent_runs=1)
    follower = asyncio.create_task(follow(b, rid))
    await die(a)
    await until(ran(fake, 2), 20)  # the lease (5 s) ran out, B swept the run and claimed it again
    assert fake.ran[1][0] == b.pid
    assert sql(fake.db, "select attempt, worker from runs where id = %s", rid) == [(2, b.pid)]
    await die(b)
    c = await fake.make(max_concurrent_runs=1)
    await until(is_status(fake, rid, "interrupted"), 20)
    assert len(fake.ran) == 2  # not started a third time
    assert await asyncio.wait_for(follower, 10) == [(1, "strategy"), (2, "restarted"), (3, "strategy")]
    tid = sql(fake.db, "select turn_id::text from runs where id = %s", rid)[0][0]
    assert sql(fake.db, "select status, progress->>'_err' from turns where id = %s", tid) == [("interrupted", "interrupted")]
    assert c.live == {}


async def test_rf3_follower_on_another_process_sees_every_event_once_and_can_resume(cluster):
    fake = cluster
    fake.n, fake.pause = 5, 0.1
    a = await fake.make()
    b = await fake.make(start=False)
    rid = await submit(fake, a, u(), "c1")
    follower = asyncio.create_task(follow(b, rid))
    await until(ran(fake, 1))
    await asyncio.sleep(0.3)
    resumed = asyncio.create_task(follow(b, rid, after=3))  # joins mid-run and resumes after seq 3
    await asyncio.sleep(1.0)
    fake.release(rid)
    seen, late = await asyncio.wait_for(follower, 15), await asyncio.wait_for(resumed, 15)
    kinds = ["strategy"] + ["sources"] * 5 + ["final_answer", "complete"]
    assert seen == [(i + 1, k) for i, k in enumerate(kinds)]
    assert late == seen[3:]


async def test_rf4_cancel_via_another_process_stops_the_run_and_returns_the_final_row(cluster):
    fake = cluster
    a = await fake.make(max_concurrent_runs=1)
    b = await fake.make(start=False, max_concurrent_runs=1)
    sid = u()
    r1 = await submit(fake, a, sid, "c1")
    r2 = await submit(fake, a, sid, "c2")  # waits behind r1
    await until(ran(fake, 1))
    with pytest.raises(PermissionError):
        await b.cancel(r1, "someone else")
    row = await b.cancel(r2, "c2")  # queued: stopped in the database by B
    assert row["status"] == "stopped" and r2 not in [x[1] for x in fake.ran]
    t2 = sql(fake.db, "select turn_id::text from runs where id = %s", r2)[0][0]
    assert sql(fake.db, "select status from turns where id = %s", t2) == [("stopped",)]
    row = await b.cancel(r1, "c1")  # running on A
    assert row["status"] == "stopped" and row["finished_at"] and fake.cancelled == [r1]
    t1 = sql(fake.db, "select turn_id::text from runs where id = %s", r1)[0][0]
    assert sql(fake.db, "select status from turns where id = %s", t1) == [("stopped",)]
    assert (await b.cancel(r1, "c1"))["status"] == "stopped"  # idempotent


async def test_admission_caps_are_counted_across_processes(cluster):
    kw = {"start": False, "max_running_per_client": 1, "max_queued_per_client": 1, "run_queue_max": 3}
    a, b = await cluster.make(**kw), await cluster.make(**kw)
    sid = u()
    await submit(cluster, a, sid, "c1")
    await submit(cluster, b, sid, "c1")  # c1 now holds 2 = 1 running + 1 queued allowed
    with pytest.raises(Rejected) as e:
        await submit(cluster, a, sid, "c1")
    assert e.value.code == "client_busy"
    await submit(cluster, b, sid, "c2")  # 3 waiting
    with pytest.raises(Rejected) as e:
        await submit(cluster, a, sid, "c3")
    assert e.value.code == "queue_full"
    assert sql(cluster.db, "select count(*) from runs") == [(3,)]  # a refused submit leaves no row

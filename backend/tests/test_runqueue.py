import asyncio

import pytest

from scientist.config import Settings
from scientist.runqueue import Rejected, RunQueue


def queue(**kw):
    s = Settings(openrouter_api_key="k", model="m", fallback_model="f", hermes_source_path=".", hermes_revision="x", **kw)
    return RunQueue(s)


class Waiter:
    """A ticket whose acquire() is being iterated, like pipeline.ask does."""

    def __init__(self, q, client, pool="research"):
        self.t = q.ticket(str(id(self)), client, pool)
        self.positions: list[int] = []
        self.task = asyncio.create_task(self._go())

    async def _go(self):
        async for p in self.t.acquire():
            self.positions.append(p)

    @property
    def running(self):
        return self.t.state == "running"


async def settle():
    for _ in range(5):
        await asyncio.sleep(0)


async def test_other_client_starts_before_a_clients_second_and_third():
    q = queue(max_concurrent_runs=2)
    a1, a2, a3 = (Waiter(q, "A") for _ in range(3))
    b1 = Waiter(q, "B")
    await settle()
    assert a1.running and b1.running and not a2.running and not a3.running  # A holds one slot, B gets the other
    assert q.status()["research"] == {"running": 2, "limit": 2, "queued": 2}


async def test_per_client_running_limit_is_across_pools():
    q = queue(max_concurrent_runs=4, sandbox_max_concurrent=3)
    r1, r2 = Waiter(q, "A"), Waiter(q, "A")
    an = Waiter(q, "A", "analysis")
    await settle()
    assert [w.running for w in (r1, r2, an)] == [True, False, False]
    r1.t.release()
    await settle()
    assert r2.running and not an.running  # earliest enqueue goes first
    r2.t.release()
    await settle()
    assert an.running


async def test_next_slot_goes_to_earliest_enqueue_among_clients_with_capacity():
    q = queue(max_concurrent_runs=1)
    a1, b1, a2, c1 = Waiter(q, "A"), Waiter(q, "B"), Waiter(q, "A"), Waiter(q, "C")
    await settle()
    assert a1.running
    a1.t.release()
    await settle()
    assert b1.running  # b1 is older than a2 and c1
    b1.t.release()
    await settle()
    assert a2.running  # A has nothing running again


async def test_positions_follow_the_fair_order_and_move_up():
    q = queue(max_concurrent_runs=1)
    a1, a2, a3, b1 = Waiter(q, "A"), Waiter(q, "A"), Waiter(q, "A"), Waiter(q, "B")
    await settle()
    # A is at its running limit: B goes before A's 2nd and 3rd
    assert (b1.positions[-1], a2.positions[-1], a3.positions[-1]) == (1, 2, 3)
    b1.task.cancel()  # B gives up while waiting
    await settle()
    assert a2.positions[-1] == 1 and a3.positions[-1] == 2
    assert q.status()["research"]["queued"] == 2


async def test_closing_acquire_early_takes_no_slot():
    q = queue(max_concurrent_runs=1)
    a = Waiter(q, "A")
    await settle()
    b = q.ticket("b", "B", "research")
    it = b.acquire()
    assert await anext(it) == 1
    await it.aclose()
    assert b.state == "closed" and q.status()["research"] == {"running": 1, "limit": 1, "queued": 0}
    a.t.release()
    assert q.status()["research"]["running"] == 0


async def test_eta_uses_default_then_average_of_finished_runs():
    q = queue(max_concurrent_runs=2, sandbox_max_concurrent=3)
    assert q.eta("research", 1) == 180 and q.eta("research", 3) == 2 * 180 and q.eta("analysis", 4) == 2 * 60
    w = Waiter(q, "A")
    await settle()
    w.t.started_at -= 100  # it ran for 100 s
    w.t.release()
    assert q.eta("research", 1) == 100 and q.eta("research", 2) == 100 and q.eta("analysis", 1) == 60  # pools are separate


async def test_ticket_eta_reaches_the_pipeline_gate_interface():
    q = queue(max_concurrent_runs=1)
    a, b = Waiter(q, "A"), Waiter(q, "B")
    await settle()
    assert b.t.position == 1 and b.t.eta(b.t.position) == 180 and getattr(b.t, "eta")(1) == 180


async def test_caps_client_busy_and_queue_full():
    q = queue(max_concurrent_runs=1, run_queue_max=3)
    ws = []
    for _ in range(3):  # 1 running + 2 queued is the most one client may have
        q.admit("A")
        ws.append(Waiter(q, "A"))
    with pytest.raises(Rejected) as e:
        q.admit("A")
    assert e.value.code == "client_busy"
    await settle()
    q.admit("B")  # 2 queued so far (A's), room for one more
    ws.append(Waiter(q, "B"))
    await settle()
    with pytest.raises(Rejected) as e:
        q.admit("C")
    assert e.value.code == "queue_full"
    ws[0].t.release()  # a slot frees: the queue shrinks, D fits again
    await settle()
    q.admit("C")


async def test_a_ticket_that_never_waits_still_counts_against_the_client():
    q = queue()
    for _ in range(3):
        q.admit("A")
        q.ticket("x", "A", "research")  # created, not acquiring yet (scope check running)
    with pytest.raises(Rejected):
        q.admit("A")

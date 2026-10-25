import asyncio

import pytest

from scientist.gate import RunGate


async def admitted(waits):
    with pytest.raises(StopAsyncIteration):
        await anext(waits)


async def test_limit_two_four_callers_queue_and_admit_in_order():
    gate = RunGate(2)
    a, b, c, d = (gate.acquire() for _ in range(4))
    await admitted(a)
    await admitted(b)
    assert await anext(c) == 1
    assert await anext(d) == 2

    d_next = asyncio.create_task(anext(d))  # d starts waiting first: order must still come from the queue
    c_next = asyncio.create_task(anext(c))
    await asyncio.sleep(0)
    assert not c_next.done() and not d_next.done()  # both full: still waiting

    gate.release()
    await admitted_task(c_next)
    assert await asyncio.wait_for(d_next, 5) == 1  # d moved up, c holds the freed slot

    d_next = asyncio.create_task(anext(d))
    gate.release()
    await admitted_task(d_next)
    assert gate.free == 0 and gate.queue == []


async def admitted_task(task):
    with pytest.raises(StopAsyncIteration):
        await asyncio.wait_for(task, 5)


async def test_leaving_the_queue_takes_no_slot_and_moves_others_up():
    gate = RunGate(1)
    await admitted(gate.acquire())
    c, d = gate.acquire(), gate.acquire()
    assert await anext(c) == 1 and await anext(d) == 2
    d_next = asyncio.create_task(anext(d))
    await asyncio.sleep(0)
    await c.aclose()  # caller gave up while waiting (client disconnect)
    assert await asyncio.wait_for(d_next, 5) == 1
    d_next = asyncio.create_task(anext(d))
    gate.release()
    await admitted_task(d_next)
    assert gate.free == 0 and gate.queue == []

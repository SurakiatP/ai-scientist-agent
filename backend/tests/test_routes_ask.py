import asyncio
import json
import sys

import httpx
import pytest

from scientist.config import get_settings
from scientist.hermes import HermesRuntime
from scientist.main import create_app
from test_pipeline import FAKE, Q, answer, crossref, paper, strategy

ENV = {"OPENROUTER_API_KEY": "k", "MODEL": "m", "FALLBACK_MODEL": "f", "HERMES_SOURCE_PATH": ".",
       "HERMES_REVISION": "x", "MAX_CONCURRENT_RUNS": "1", "SSE_PING_SECONDS": "0.05"}
ORIGIN = "http://localhost:3000"


@pytest.fixture
async def app(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)  # no stray .env
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    script = tmp_path / "script.json"
    script.write_text(json.dumps({
        "slow": [paper("Slow", "10.1000/slow"), {"sleep": 30}],
        "*": [paper("BE4", "10.1000/be4"), answer("BE4 works")],
    }))
    rt = HermesRuntime(get_settings(), command=[sys.executable, FAKE, str(script)])
    app = create_app(runner=rt, client=crossref())
    async with app.router.lifespan_context(app):
        yield app
    assert not rt.procs  # shutdown closed the runtime
    get_settings.cache_clear()


async def post(app, body, **headers):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        return await c.post("/v1/async/ask", json=body, headers=headers)


def events(text):
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


class Stream:
    """One POST driven by hand: httpx's ASGITransport buffers the whole body, so it can neither show events
    as they arrive nor disconnect mid-stream."""

    def __init__(self, app, question):
        self.chunks, self.gone = asyncio.Queue(), asyncio.Event()
        body = [{"type": "http.request", "body": json.dumps({"question": question}).encode()}]

        async def receive():
            if body:
                return body.pop()
            await self.gone.wait()
            return {"type": "http.disconnect"}

        async def send(msg):
            if msg.get("body"):
                await self.chunks.put(msg["body"].decode())

        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
                 "scheme": "http", "path": "/v1/async/ask", "raw_path": b"/v1/async/ask", "query_string": b"",
                 "root_path": "", "headers": [(b"host", b"t"), (b"content-type", b"application/json")],
                 "client": ("127.0.0.1", 1), "server": ("t", 80)}
        self.task = asyncio.create_task(app(scope, receive, send))

    async def next(self, skip_pings=True):
        while (chunk := await asyncio.wait_for(self.chunks.get(), 10)).startswith(": ping") and skip_pings:
            pass
        return "ping" if chunk.startswith(":") else json.loads(chunk.removeprefix("data: "))

    async def disconnect(self):
        self.gone.set()
        await asyncio.wait_for(self.task, 30)  # returns once the run is cleaned up


@pytest.mark.parametrize("body", [{"question": ""}, {"question": "   "}, {"question": "x" * 2001}, {},
                                  {"question": 5}, {"question": None}, {"question": ["a"]}])
async def test_bad_question_is_422_before_any_model_call(app, fake_complete, body):
    r = await post(app, body)
    assert r.status_code == 422
    assert fake_complete["calls"] == []


async def test_off_topic_is_one_refused_event_and_no_branch(app, fake_complete, monkeypatch):
    monkeypatch.setattr(app.state.runner, "run", lambda *a: pytest.fail("runner called"))
    r = await post(app, {"question": "Give me a recipe for pad thai"})
    assert [e["type"] for e in events(r.text)] == ["refused"]
    assert fake_complete["calls"] == []
    assert app.state.gate.free == 1


async def test_happy_path_streams_in_order_with_sse_headers_and_cors(app, fake_complete):
    fake_complete["strategy"] = strategy("base editing")
    r = await post(app, {"question": Q}, origin=ORIGIN)
    assert [e["type"] for e in events(r.text)] == ["strategy", "sources", "answer", "final_answer", "complete"]
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["cache-control"] == "no-cache" and r.headers["x-accel-buffering"] == "no"
    assert r.headers["access-control-allow-origin"] == ORIGIN
    assert events(r.text)[3]["references"][0]["status"] == "verified"


async def test_unknown_origin_gets_no_cors_header(app, fake_complete):
    r = await post(app, {"question": "Give me a recipe for pad thai"}, origin="http://evil.example")
    assert "access-control-allow-origin" not in r.headers


async def test_queue_ping_and_disconnect_frees_slot_for_next_run(app, fake_complete):
    fake_complete["strategy"] = strategy("slow")
    a = Stream(app, Q)
    assert (await a.next())["type"] == "strategy"
    assert (await a.next())["type"] == "sources"
    a_procs = set(app.state.runner.procs)
    assert a_procs  # a's bridge is sleeping, a holds the only slot

    fake_complete["strategy"] = strategy("base editing")
    b = Stream(app, Q)
    assert await b.next() == {"type": "waiting", "position": 1}
    assert await b.next(skip_pings=False) == "ping"  # heartbeat while queued

    await a.disconnect()
    assert all(p.returncode is not None for p in a_procs)  # a's bridges were killed
    assert not a_procs & app.state.runner.procs

    got = []
    while not got or got[-1] not in ("complete", "error"):
        got.append((await b.next())["type"])
    assert got == ["strategy", "sources", "answer", "final_answer", "complete"]
    await asyncio.wait_for(b.task, 10)
    assert app.state.gate.free == 1 and app.state.gate.queue == []


async def test_history_plan_clamped_not_rejected(app, fake_complete):
    fake_complete["strategy"] = None
    turns = [{"question": str(i) * 3000, "answer": "a"} for i in range(5)]
    plan = [{"term": " "}, {"term": "การ"}] + [{"term": f"t{i}"} for i in range(9)]
    r = await post(app, {"question": "What is CRISPR?", "history": turns, "plan": plan, "plan_only": True})
    assert r.status_code == 200
    ev = events(r.text)
    strat = next(e for e in ev if e["type"] == "strategy")
    assert len(strat["searches"]) == app.state.settings.max_branches
    assert ev[-1]["type"] == "complete"
    assert (await post(app, {"question": "q", "mode": "slow"})).status_code == 422


async def test_oversize_plan_fields_and_lists_422(app):
    q = "What is CRISPR?"
    assert (await post(app, {"question": q, "plan": [{"term": "t" * 201}]})).status_code == 422
    assert (await post(app, {"question": q, "plan": [{"term": "t", "instructions": "i" * 501}]})).status_code == 422
    assert (await post(app, {"question": q, "plan": [{"term": "t"}] * 21})).status_code == 422
    turn = {"question": "q", "answer": "a"}
    assert (await post(app, {"question": q, "history": [turn] * 21})).status_code == 422


async def test_plan_only_429_when_gate_saturated_and_queue_full(app, fake_complete):
    app.state.gate.free = 0
    app.state.gate.queue = [object()] * app.state.settings.analyze_max_queue
    r = await post(app, {"question": "What is CRISPR?", "plan_only": True})
    assert r.status_code == 429

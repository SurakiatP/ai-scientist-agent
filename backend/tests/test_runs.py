"""Server-owned runs: needs the throwaway Postgres (skipped without docker), fake bridge and fake model."""
import asyncio
import io
import json
import sys
import uuid
from contextlib import asynccontextmanager

import httpx
import pytest
from alembic import command

from scientist import usage
from scientist.config import get_settings
from scientist.hermes import HermesRuntime
from scientist.main import create_app
from scientist.runs import reduce_analysis, reduce_progress
from test_analyze import fakes  # noqa: F401
from test_config import ENV
from test_db import _alembic, newdb, pg  # noqa: F401
from test_pipeline import FAKE, Q, answer, crossref, paper, strategy
from test_routes_files import MemStore
from test_store import sql

u = lambda: str(uuid.uuid4())  # noqa: E731
MEM = [{"question": "q", "answer": "a [1]", "references": []}]


@pytest.fixture(autouse=True)
def _env(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    for k, v in {**ENV, "SSE_PING_SECONDS": "0.05", "MINIO_ENDPOINT": "http://x"}.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def serve(newdb, tmp_path, monkeypatch):  # noqa: F811
    """serve(**env) -> async context manager yielding an httpx client on a running app (lifespan included)."""
    command.upgrade(_alembic(), "head")
    script = tmp_path / "script.json"
    script.write_text(json.dumps({"slow": [paper("Slow", "10.1000/slow"), {"sleep": 30}],
                                  "*": [paper("BE4", "10.1000/be4"), answer("BE4 works")]}))

    @asynccontextmanager
    async def go(**env):
        for k, v in env.items():
            monkeypatch.setenv(k, str(v))
        get_settings.cache_clear()
        store = MemStore()
        orig = store.put

        async def put(key, data, **kw):  # the real store takes bytes too; MemStore only knew file objects
            await orig(key, io.BytesIO(data) if isinstance(data, bytes) else data, **kw)
        store.put = put
        app = create_app(runner=HermesRuntime(get_settings(), command=[sys.executable, FAKE, str(script)]),
                         client=crossref(), store=store)
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
                c.app, c.objs = app, store.objs
                yield c

    return go


async def mk_session(c):
    sid = u()
    assert (await c.put(f"/v1/store/sessions/{sid}", json={"title": "t"})).status_code == 200
    return sid


def body(sid, **kw):
    return {"session_id": sid, "turn_id": u(), "kind": "ask", "question": Q, "mode": "deep", **kw}


def chat(sid, **kw):
    return body(sid, mode="chat", memory=MEM, **kw)


async def post(c, b, cid=None):
    return await c.post("/v1/runs", json=b, headers={"x-client-id": cid or u()})


async def until(c, rid, *want, t=15):
    for _ in range(int(t / 0.05)):
        r = (await c.get(f"/v1/runs/{rid}")).json()
        if r["status"] in want:
            return r
        await asyncio.sleep(0.05)
    raise AssertionError(f"run {rid} still {r['status']}")


async def turn_of(c, sid, tid):
    snap = (await c.get("/v1/store/snapshot")).json()
    return next(t for s in snap["sessions"] if s["id"] == sid for t in s["turns"] if t["id"] == tid)


def sse(text):
    out, cur = [], {}
    for line in text.splitlines():
        if line.startswith("id: "):
            cur["id"] = int(line[4:])
        elif line.startswith("data: "):
            out.append({**cur, "data": json.loads(line[6:])})
            cur = {}
    return out


def test_migration_0004_up_down(newdb):  # noqa: F811
    command.upgrade(_alembic(), "head")
    assert sql(newdb, "select count(*) from runs") == [(0,)] and sql(newdb, "select count(run_id) from turns") == [(0,)]
    command.downgrade(_alembic(), "0003")
    assert sql(newdb, "select to_regclass('runs'), to_regclass('run_events')") == [(None, None)]
    assert sql(newdb, "select count(*) from information_schema.columns where table_name='turns' and column_name='run_id'") == [(0,)]
    command.upgrade(_alembic(), "head")


# --- the frontend reducers, ported ---------------------------------------------------------------------------------------
def test_reduce_progress_matches_progress_ts():
    p = {"waiting": None, "reasoning": "", "searches": [], "sources": {}, "answered": [], "writing": False, "phase": "planning"}
    evs = [{"type": "waiting", "position": 2}, {"type": "strategy", "reasoning": "r", "searches": [{"term": "a", "instructions": "i"}]},
           {"type": "sources", "term": "a", "papers": [{}]}, {"type": "sources", "term": "a", "papers": [{}, {}]},
           {"type": "answer", "term": "a", "content": "x"}, {"type": "sources", "term": "b", "papers": [{}]},
           {"type": "refused", "reason": "x"}, {"type": "final_answer", "content": "c", "references": []}]
    steps = []
    for e in evs:
        p = reduce_progress(p, e)
        steps.append(p["phase"])
    assert steps == ["waiting", "searching", "searching", "searching", "writing", "writing", "writing", "done"]
    assert p == {"waiting": 2, "reasoning": "r", "searches": [{"term": "a", "instructions": "i"}], "sources": {"a": 3, "b": 1},
                 "answered": ["a"], "writing": False, "phase": "done"}  # waiting is kept, as in progress.ts


def test_reduce_analysis_matches_run_ts():
    a = {"fileId": "f", "steps": []}
    for e in [{"type": "analysis_step", "step": "profiling"}, {"type": "analysis_step", "step": "profiling"},
              {"type": "analysis_script", "code": "x"}, {"type": "analysis_step", "step": "running"},
              {"type": "analysis_result", "quality": {"q": 1}, "tables": [], "findings": ["f"], "timings": {}, "artifacts": []}]:
        a = reduce_analysis(a, e)
    assert a == {"fileId": "f", "steps": ["profiling", "running"], "script": "x", "quality": {"q": 1}, "tables": [],
                 "findings": ["f"], "timings": {}, "artifacts": []}


# --- lifecycle -------------------------------------------------------------------------------------------------------------
async def test_submit_returns_at_once_and_the_server_writes_the_finished_turn(serve, fake_complete):
    fake_complete["strategy"] = strategy("base editing")
    async with serve() as c:
        sid = await mk_session(c)
        b = body(sid)
        r = await post(c, b, cid="3f0c1d52-8a4e-4b1c-9d3a-2f6b7a8c9d01")
        assert r.status_code == 202
        j = r.json()
        assert set(j) == {"run", "turn"} and "client_id" not in j["run"]
        assert j["run"]["status"] == "queued" and j["run"]["mine"] is True and j["run"]["turn_id"] == b["turn_id"]
        assert j["turn"]["status"] == "running" and j["turn"]["run_id"] == j["run"]["id"] and j["turn"]["idx"] == 0
        assert j["turn"]["progress"]["phase"] == "planning"
        run = await until(c, j["run"]["id"], "done")
        assert run["finished_at"] and run["started_at"]
        t = await turn_of(c, sid, b["turn_id"])
        assert t["status"] == "done" and t["run_id"] == j["run"]["id"] and t["answer"]["references"][0]["status"] == "verified"
        assert t["progress"] == {"waiting": None, "reasoning": "plan", "searches": [{"term": "base editing", "instructions": "extract base editing"}],
                                 "sources": {"base editing": 1}, "answered": ["base editing"], "writing": False, "phase": "done"}
        ev = sse((await c.get(f"/v1/runs/{j['run']['id']}/events")).text)
        assert [e["id"] for e in ev] == [1, 2, 3, 4, 5]
        assert [e["data"]["type"] for e in ev] == ["strategy", "sources", "answer", "final_answer", "complete"]
        await usage.drain()


async def test_second_turn_is_appended_and_finished_turns_conflict(serve, fake_complete):
    async with serve() as c:
        sid = await mk_session(c)
        r1, r2 = chat(sid), chat(sid)
        cid = u()
        a = await post(c, r1, cid)
        await until(c, a.json()["run"]["id"], "done")
        b = await post(c, r2, cid)
        assert b.json()["turn"]["idx"] == 1
        await until(c, b.json()["run"]["id"], "done")
        assert (await post(c, r1, cid)).status_code == 409  # the turn exists and is not awaiting a plan
        assert (await post(c, chat(u()), cid)).status_code == 404  # no such session


async def test_approved_plan_runs_on_the_awaiting_turn(serve, fake_complete):
    fake_complete["strategy"] = strategy("never used")
    async with serve() as c:
        sid, tid, cid = await mk_session(c), u(), u()
        t = {"idx": 0, "question": Q, "mode": "deep", "status": "awaiting_plan", "plan": [{"term": "x", "instructions": ""}]}
        assert (await c.put(f"/v1/store/sessions/{sid}/turns/{tid}", json=t)).status_code == 200
        r = await post(c, {"session_id": sid, "turn_id": tid, "kind": "ask", "question": Q,
                           "plan": [{"term": "edited term", "instructions": "go"}]}, cid)
        assert r.status_code == 202 and r.json()["turn"]["idx"] == 0 and r.json()["turn"]["status"] == "running"
        await until(c, r.json()["run"]["id"], "done")
        t = await turn_of(c, sid, tid)
        assert t["status"] == "done" and t["plan"] == [{"term": "edited term", "instructions": "go"}]
        assert t["progress"]["searches"] == [{"term": "edited term", "instructions": "go"}]


async def test_refusal_and_error_are_written_to_the_turn(serve, fake_complete):
    async with serve() as c:
        sid, cid = await mk_session(c), u()
        b = body(sid, question="Give me a recipe for pad thai")
        r = await post(c, b, cid)
        await until(c, r.json()["run"]["id"], "refused")
        t = await turn_of(c, sid, b["turn_id"])
        assert t["status"] == "refused" and t["refused"] and "_code" in t["progress"]
        fake_complete["strategy"] = None  # no usable plan -> the pipeline's own Error event
        b = body(sid)
        r = await post(c, b, cid)
        await until(c, r.json()["run"]["id"], "error")
        t = await turn_of(c, sid, b["turn_id"])
        assert t["status"] == "error" and t["error"]


async def test_analysis_run(serve, fakes):  # noqa: F811
    async with serve() as c:
        sid, cid, fid = await mk_session(c), u(), "f" * 32
        c.objs[fid] = (b"a,b\n1,2\n", {"content_type": "text/csv", "name": "d.csv"})
        b = {"session_id": sid, "turn_id": u(), "kind": "analyze", "question": "Plot column trend in genome data", "file_id": fid}
        r = await post(c, b, cid)
        assert r.status_code == 202 and r.json()["turn"]["mode"] == "analysis"
        assert r.json()["turn"]["analysis"] == {"fileId": fid, "fileName": "d.csv", "steps": []}
        await until(c, r.json()["run"]["id"], "done")
        a = (await turn_of(c, sid, b["turn_id"]))["analysis"]
        assert a["steps"] == ["profiling", "writing_script", "running", "storing"] and a["findings"] == ["mean a is 2"]
        assert a["script"] and a["artifacts"] and a["fileName"] == "d.csv"
        bad = {**b, "turn_id": u(), "file_id": "e" * 32}
        assert (await post(c, bad, cid)).status_code == 404


# --- following ----------------------------------------------------------------------------------------------------------
async def test_disconnecting_a_stream_does_not_cancel_and_reattach_replays_only_newer(serve, fake_complete):
    fake_complete["strategy"] = strategy("slow")
    async with serve() as c:
        sid, cid = await mk_session(c), u()
        r = await post(c, body(sid), cid)
        rid = r.json()["run"]["id"]
        svc = c.app.state.runs
        gen = svc.events(rid, 0, 0.05)
        got = []
        while len(got) < 2:
            seq, ev = await asyncio.wait_for(anext(gen), 10)
            if ev:
                got.append((seq, ev["type"]))
        assert got == [(1, "strategy"), (2, "sources")]
        await gen.aclose()  # the viewer went away
        await asyncio.sleep(0.2)
        assert (await c.get(f"/v1/runs/{rid}")).json()["status"] == "running"
        assert svc.live[rid].subs == set()
        # another viewer resumes after what it saw; the run is still going, so cancel it to end the stream
        gen = svc.events(rid, 2, 0.05)
        assert (await asyncio.wait_for(anext(gen), 10))[1] is None  # nothing newer yet: a ping
        cancel = asyncio.create_task(c.post(f"/v1/runs/{rid}/cancel", headers={"x-client-id": cid}))
        assert [x[1] async for x in gen if x[1]] == [{"type": "error", "message": "stopped", "code": "stopped"}]  # told how it ended
        assert (await cancel).json()["status"] == "stopped"


async def test_events_route_replay_after_and_last_event_id(serve, fake_complete):
    fake_complete["strategy"] = strategy("base editing")
    async with serve() as c:
        sid = await mk_session(c)
        rid = (await post(c, body(sid))).json()["run"]["id"]
        await until(c, rid, "done")
        assert [e["id"] for e in sse((await c.get(f"/v1/runs/{rid}/events", params={"after": 3})).text)] == [4, 5]
        assert [e["id"] for e in sse((await c.get(f"/v1/runs/{rid}/events", headers={"last-event-id": "4"})).text)] == [5]
        assert sse((await c.get(f"/v1/runs/{rid}/events", params={"after": 5})).text) == []
        assert (await c.get(f"/v1/runs/{u()}/events")).status_code == 404


async def test_queued_run_shows_position_and_eta_and_sends_waiting_first(serve, fake_complete):
    fake_complete["strategy"] = strategy("slow")
    async with serve(MAX_CONCURRENT_RUNS=1) as c:
        sid, a, b = await mk_session(c), u(), u()
        r1 = (await post(c, body(sid), a)).json()["run"]["id"]
        await until(c, r1, "running")
        r2 = (await post(c, body(sid), b)).json()["run"]["id"]
        for _ in range(100):
            v = (await c.get(f"/v1/runs/{r2}", headers={"x-client-id": b})).json()
            if v.get("position"):
                break
            await asyncio.sleep(0.05)
        assert v["status"] == "queued" and v["position"] == 1 and v["eta_seconds"] == 180 and v["mine"] is True
        assert (await c.get(f"/v1/runs/{r2}", headers={"x-client-id": a})).json()["mine"] is False
        gen = c.app.state.runs.events(r2, 0, 0.05)
        first = [x async for x in _take(gen, 2)]
        assert first[0] == (1, {"type": "waiting", "position": 1, "eta_seconds": 180})  # the stored one
        assert first[1] == (None, {"type": "waiting", "position": 1, "eta_seconds": 180})  # the live one: no id
        await gen.aclose()
        assert (await c.get("/v1/runs/status")).json() == {"research": {"running": 1, "limit": 1, "queued": 1},
                                                           "analysis": {"running": 0, "limit": 3, "queued": 0}}
        for rid, cid in ((r1, a), (r2, b)):
            await c.post(f"/v1/runs/{rid}/cancel", headers={"x-client-id": cid})


async def _take(gen, n):
    while n:
        x = await asyncio.wait_for(anext(gen), 10)
        if x[1]:
            n -= 1
            yield x


# --- cancel ------------------------------------------------------------------------------------------------------------------
async def test_cancel_is_owner_only_idempotent_and_stops_the_turn(serve, fake_complete):
    fake_complete["strategy"] = strategy("slow")
    async with serve() as c:
        sid, owner, other = await mk_session(c), u(), u()
        b = body(sid)
        rid = (await post(c, b, owner)).json()["run"]["id"]
        await until(c, rid, "running")
        assert (await c.post(f"/v1/runs/{rid}/cancel", headers={"x-client-id": other})).status_code == 403
        assert (await c.post(f"/v1/runs/{rid}/cancel")).status_code == 400  # no client id
        assert (await c.get(f"/v1/runs/{rid}")).json()["status"] == "running"
        procs = set(c.app.state.runner.procs)
        r = await c.post(f"/v1/runs/{rid}/cancel", headers={"x-client-id": owner})
        assert r.status_code == 200 and r.json()["status"] == "stopped"
        t = await turn_of(c, sid, b["turn_id"])
        assert t["status"] == "stopped" and t["progress"]["phase"] == "searching"
        assert all(p.returncode is not None for p in procs)  # the bridge was killed
        assert (await c.post(f"/v1/runs/{rid}/cancel", headers={"x-client-id": owner})).json()["status"] == "stopped"
        assert (await c.post(f"/v1/runs/{u()}/cancel", headers={"x-client-id": owner})).status_code == 404
        assert c.app.state.queue.status()["research"]["running"] == 0


# --- caps ----------------------------------------------------------------------------------------------------------------
async def test_client_busy_and_queue_full_are_429_with_codes(serve, fake_complete):
    fake_complete["strategy"] = strategy("slow")
    async with serve(MAX_CONCURRENT_RUNS=1, RUN_QUEUE_MAX=2) as c:
        sid, a, b, d = await mk_session(c), u(), u(), u()
        ids = [(await post(c, body(sid), a)).json()["run"]["id"] for _ in range(1)]
        ids += [(await post(c, body(sid), b)).json()["run"]["id"]]  # waits behind a
        r = await post(c, body(sid), d)
        assert r.status_code == 202  # 2 in the queue incl. d's own is allowed only if below RUN_QUEUE_MAX
        r = await post(c, body(sid), u())
        assert r.status_code == 429 and r.json()["code"] == "queue_full" and r.json()["detail"]
        for _ in range(2):  # client a: one running + queue; max 1 running + 2 queued
            pass
        for rid, cid in zip(ids, (a, b)):
            await c.post(f"/v1/runs/{rid}/cancel", headers={"x-client-id": cid})


async def test_client_busy(serve, fake_complete):
    fake_complete["strategy"] = strategy("slow")
    async with serve(MAX_CONCURRENT_RUNS=4) as c:
        sid, a = await mk_session(c), u()
        rids = [(await post(c, body(sid), a)).json()["run"]["id"] for _ in range(3)]  # 1 running + 2 queued
        r = await post(c, body(sid), a)
        assert r.status_code == 429 and r.json()["code"] == "client_busy"
        assert (await post(c, body(sid), u())).status_code == 202  # another browser is fine
        for rid in rids:
            await c.post(f"/v1/runs/{rid}/cancel", headers={"x-client-id": a})
        assert (await post(c, body(sid), a)).status_code == 202


async def test_client_id_validation_and_validation_errors(serve, fake_complete):
    async with serve() as c:
        sid = await mk_session(c)
        assert (await c.post("/v1/runs", json=body(sid))).status_code == 400
        assert (await c.post("/v1/runs", json=body(sid), headers={"x-client-id": "nope"})).status_code == 400
        assert (await post(c, {**body(sid), "plan_only": True})).status_code == 422
        assert (await post(c, {**body(sid), "question": " "})).status_code == 422
        assert (await post(c, {**body(sid), "kind": "x"})).status_code == 422
        assert (await post(c, {**body(sid), "session_id": "nope"})).status_code == 422
        assert (await post(c, {**body(sid), "kind": "analyze"})).status_code == 422  # no file
        assert fake_complete["calls"] == []


# --- restart -----------------------------------------------------------------------------------------------------------------
async def test_restart_marks_runs_and_turns_interrupted(serve, fake_complete, newdb):  # noqa: F811
    fake_complete["strategy"] = strategy("slow")
    async with serve() as c:
        sid = await mk_session(c)
        b = body(sid)
        rid = (await post(c, b)).json()["run"]["id"]
        await until(c, rid, "running")
        # a crashed process leaves rows behind: fake it with a second run that no task owns
        sql(newdb, "insert into runs(id, client_id, session_id, turn_id, kind, status) values (%s,%s,%s,%s,'ask','running')",
            ghost := u(), u(), sid, gt := u())
        sql(newdb, "insert into turns(id, session_id, idx, question, status) values (%s,%s,9,'q','running')", gt, sid)
    # leaving the app = shutdown: the live run is recorded as interrupted
    r = sql(newdb, "select id::text, status from runs order by created_at")
    assert dict(r)[rid] == "interrupted" and dict(r)[ghost] == "running"
    assert sql(newdb, "select status from turns where id = %s", b["turn_id"]) == [("interrupted",)]
    async with serve() as c:  # next boot
        assert (await c.get(f"/v1/runs/{ghost}")).json()["status"] == "interrupted"
        assert (await turn_of(c, sid, gt))["status"] == "interrupted"
        assert (await c.get(f"/v1/runs/{ghost}")).json()["finished_at"]


# --- old routes ---------------------------------------------------------------------------------------------------------------
async def test_old_routes_are_409_with_a_database_except_plan_only(serve, fake_complete):
    fake_complete["strategy"] = strategy("a")
    async with serve() as c:
        r = await c.post("/v1/async/ask", json={"question": Q, "mode": "deep"})
        assert r.status_code == 409 and r.json()["code"] == "use_runs"
        assert (await c.post("/v1/async/ask", json={"question": Q, "mode": "chat", "memory": MEM})).status_code == 409
        assert (await c.post("/v1/async/analyze", json={"file_id": "f" * 32, "question": "x"})).json()["code"] == "use_runs"
        r = await c.post("/v1/async/ask", json={"question": Q, "plan_only": True})
        assert r.status_code == 200 and '"strategy"' in r.text


async def test_runs_need_the_database():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://t") as c:
        for m, p in (("POST", "/v1/runs"), ("GET", "/v1/runs/status"), ("GET", f"/v1/runs/{u()}/events"), ("POST", f"/v1/runs/{u()}/cancel")):
            r = await c.request(m, p, json={}, headers={"x-client-id": u()})
            assert r.status_code == 503 and r.json() == {"detail": "runs need the shared store"}, p


# --- store pieces --------------------------------------------------------------------------------------------------------------
async def test_client_put_without_run_id_keeps_the_server_link(serve, fake_complete):
    async with serve() as c:
        sid = await mk_session(c)
        b = chat(sid)
        r = await post(c, b)
        await until(c, r.json()["run"]["id"], "done")
        t = await turn_of(c, sid, b["turn_id"])
        put = {"idx": t["idx"], "question": t["question"], "status": "done", "version": t["version"]}
        assert (await c.put(f"/v1/store/sessions/{sid}/turns/{b['turn_id']}", json=put)).status_code == 200
        assert (await turn_of(c, sid, b["turn_id"]))["run_id"] == r.json()["run"]["id"]


async def test_server_turn_writes_bump_version_and_broadcast(serve, fake_complete):
    async with serve() as c:
        sid = await mk_session(c)
        data = c.app.state.data
        async with data.bus.subscribe() as q:
            b = chat(sid)
            r = await post(c, b)
            await until(c, r.json()["run"]["id"], "done")
            msgs = []
            while not q.empty():
                msgs.append(q.get_nowait())
        turns = [m for m in msgs if m["entity"] == "turn" and m["id"] == b["turn_id"]]
        assert turns and all(m["session_id"] == sid for m in turns)
        assert [m["version"] for m in turns] == sorted({m["version"] for m in turns}) and turns[-1]["version"] >= 2


async def test_retention_purges_old_finished_runs_with_their_events(serve, fake_complete, newdb):  # noqa: F811
    async with serve() as c:
        sid = await mk_session(c)
        old, new = u(), u()
        for rid, days in ((old, 8), (new, 1)):
            sql(newdb, "insert into runs(id, client_id, kind, status, finished_at) values (%s,'c','ask','done', now() - make_interval(days => %s))", rid, days)
            sql(newdb, "insert into run_events(run_id, seq, event) values (%s, 1, '{}')", rid)
        sql(newdb, "insert into runs(id, client_id, kind, status) values (%s,'c','ask','running')", u())
        assert await c.app.state.data.purge_runs() == 1
        assert sql(newdb, "select count(*) from run_events where run_id = %s", old) == [(0,)]
        assert sql(newdb, "select count(*) from runs") == [(2,)]


async def test_usage_rows_carry_session_and_turn(serve, fake_complete, newdb):  # noqa: F811
    async with serve() as c:
        sid = await mk_session(c)
        b = chat(sid)
        await until(c, (await post(c, b)).json()["run"]["id"], "done")
        await usage.drain()
    assert sql(newdb, "select mode, session_id::text, turn_id::text, ok from usage_events") == [("chat", sid, b["turn_id"], True)]


# --- fix round 1 ------------------------------------------------------------------------------------------------------------
async def test_two_concurrent_cancels_write_stopped_once(serve, fake_complete, newdb):  # noqa: F811
    fake_complete["strategy"] = strategy("slow")
    async with serve() as c:
        sid, cid = await mk_session(c), u()
        b = body(sid)
        rid = (await post(c, b, cid)).json()["run"]["id"]
        await until(c, rid, "running")
        rs = await asyncio.gather(*(c.post(f"/v1/runs/{rid}/cancel", headers={"x-client-id": cid}) for _ in range(3)))
        assert [r.json()["status"] for r in rs] == ["stopped"] * 3
        t = await turn_of(c, sid, b["turn_id"])
        assert t["status"] == "stopped" and t["progress"]["_err"] == "stopped"
        assert sql(newdb, "select count(*) from run_events where run_id = %s and event->>'code' = 'stopped'", rid) == [(1,)]


async def test_cancel_racing_a_natural_finish_ends_in_one_terminal_state(serve, fake_complete):
    fake_complete["strategy"] = strategy("base editing")
    async with serve() as c:
        sid, cid = await mk_session(c), u()
        b = chat(sid)
        rid = (await post(c, b, cid)).json()["run"]["id"]
        r = await c.post(f"/v1/runs/{rid}/cancel", headers={"x-client-id": cid})
        t = await turn_of(c, sid, b["turn_id"])
        run = await until(c, rid, "done", "stopped")
        assert r.status_code == 200 and run["status"] == t["status"] in ("done", "stopped")
        assert (await turn_of(c, sid, b["turn_id"]))["status"] == run["status"]


async def test_shutdown_after_user_cancel_stays_stopped_and_shutdown_streams_get_interrupted(serve, fake_complete, newdb):  # noqa: F811
    fake_complete["strategy"] = strategy("slow")
    async with serve() as c:
        sid, a, b_ = await mk_session(c), u(), u()
        t1, t2 = body(sid), body(sid)
        r1 = (await post(c, t1, a)).json()["run"]["id"]
        await until(c, r1, "running")
        r2 = (await post(c, t2, b_)).json()["run"]["id"]
        await c.post(f"/v1/runs/{r1}/cancel", headers={"x-client-id": a})
        r2_running = await until(c, r2, "running")
        gen = c.app.state.runs.events(r2, 0, 0.05)
        seen = []

        async def watch():
            async for x in gen:
                if x[1]:
                    seen.append(x[1])
        w = asyncio.create_task(watch())
        await asyncio.sleep(0.3)
        await c.app.state.runs.shutdown()
        await asyncio.wait_for(w, 10)
        assert seen[-1] == {"type": "error", "message": "interrupted", "code": "interrupted"} and r2_running
    rows = dict(sql(newdb, "select id::text, status from runs"))
    assert rows[r1] == "stopped" and rows[r2] == "interrupted"
    st = dict(sql(newdb, "select id::text, status from turns"))
    assert st[t1["turn_id"]] == "stopped" and st[t2["turn_id"]] == "interrupted"


async def test_turn_removed_mid_run_stops_the_run_and_nothing_is_written_after(serve, fake_complete, newdb):  # noqa: F811
    fake_complete["strategy"] = strategy("slow")
    async with serve() as c:
        sid, cid = await mk_session(c), u()
        b = body(sid)
        rid = (await post(c, b, cid)).json()["run"]["id"]
        await until(c, rid, "running")
        await asyncio.sleep(0.3)
        assert (await c.delete(f"/v1/store/sessions/{sid}/turns/from/0")).json() == {"removed": 1}
        run = await until(c, rid, "stopped")
        assert run["finished_at"]
        assert sql(newdb, "select count(*) from turns where id = %s", b["turn_id"]) == [(0,)]  # not resurrected
        assert c.app.state.queue.status()["research"]["running"] == 0


async def test_cancel_a_queued_run_frees_the_ticket_and_stops_the_turn(serve, fake_complete):
    fake_complete["strategy"] = strategy("slow")
    async with serve(MAX_CONCURRENT_RUNS=1) as c:
        sid, a, b_ = await mk_session(c), u(), u()
        r1 = (await post(c, body(sid), a)).json()["run"]["id"]
        await until(c, r1, "running")
        tb = body(sid)
        r2 = (await post(c, tb, b_)).json()["run"]["id"]
        for _ in range(100):
            if c.app.state.queue.status()["research"]["queued"] == 1 and c.app.state.runs.live[r2].ticket.state == "queued":
                break
            await asyncio.sleep(0.05)
        assert (await c.post(f"/v1/runs/{r2}/cancel", headers={"x-client-id": b_})).json()["status"] == "stopped"
        assert (await turn_of(c, sid, tb["turn_id"]))["status"] == "stopped"
        assert c.app.state.queue.status()["research"] == {"running": 1, "limit": 1, "queued": 0}
        await c.post(f"/v1/runs/{r1}/cancel", headers={"x-client-id": a})


async def test_shutdown_while_queued_marks_interrupted(serve, fake_complete, newdb):  # noqa: F811
    fake_complete["strategy"] = strategy("slow")
    async with serve(MAX_CONCURRENT_RUNS=1) as c:
        sid = await mk_session(c)
        r1 = (await post(c, body(sid))).json()["run"]["id"]
        await until(c, r1, "running")
        tb = body(sid)
        r2 = (await post(c, tb)).json()["run"]["id"]
        await asyncio.sleep(0.3)
    assert dict(sql(newdb, "select id::text, status from runs"))[r2] == "interrupted"
    assert sql(newdb, "select status, progress->>'_err' from turns where id = %s", tb["turn_id"]) == [("interrupted", "interrupted")]


async def test_replay_live_handoff_delivers_each_event_once(serve, fake_complete):
    """An event persisted and published between the viewer's subscribe and its replay query comes once."""
    fake_complete["strategy"] = strategy("slow")
    async with serve() as c:
        sid = await mk_session(c)
        rid = (await post(c, body(sid))).json()["run"]["id"]
        svc = c.app.state.runs
        await until(c, rid, "running")
        while svc.live[rid].seq < 2:
            await asyncio.sleep(0.02)
        run = svc.live[rid]
        gen = svc.events(rid, 0, 0.05)
        first = await asyncio.wait_for(anext(gen), 10)  # subscribed, replay read
        # publish a duplicate of an already replayed seq (the race's effect) plus a new event
        run.seq += 1
        for q in run.subs:
            q.put_nowait((1, {"type": "dup"}))
            q.put_nowait((run.seq, {"type": "answer", "term": "x", "content": ""}))
        got = [first]
        while len(got) < 3:
            x = await asyncio.wait_for(anext(gen), 10)
            if x[1]:
                got.append(x)
        await gen.aclose()
        assert [g[0] for g in got] == [1, 2, run.seq] and "dup" not in [g[1]["type"] for g in got]
        await c.post(f"/v1/runs/{rid}/cancel", headers={"x-client-id": run.row["client_id"]})


async def test_trailing_progress_is_flushed_by_a_timer(serve, fake_complete, monkeypatch):
    import scientist.runs as runs
    monkeypatch.setattr(runs, "WRITE_EVERY", 0.3)
    fake_complete["strategy"] = strategy("slow")
    async with serve() as c:
        sid, cid = await mk_session(c), u()
        b = body(sid)
        rid = (await post(c, b, cid)).json()["run"]["id"]
        for _ in range(100):  # strategy and sources arrive together: the second is throttled, then flushed
            t = await turn_of(c, sid, b["turn_id"])
            if t["progress"]["sources"]:
                break
            await asyncio.sleep(0.05)
        assert t["progress"]["sources"] == {"slow": 1}
        await c.post(f"/v1/runs/{rid}/cancel", headers={"x-client-id": cid})


async def test_complete_without_an_answer_is_error_and_analysis_keeps_empty_progress(serve, fake_complete, fakes):  # noqa: F811
    async with serve() as c:
        sid, cid, fid = await mk_session(c), u(), "f" * 32
        c.objs[fid] = (b"a,b\n1,2\n", {"content_type": "text/csv", "name": "d.csv"})
        b = {"session_id": sid, "turn_id": u(), "kind": "analyze", "question": "Plot column trend in genome data", "file_id": fid}
        await until(c, (await post(c, b, cid)).json()["run"]["id"], "done")
        assert (await turn_of(c, sid, b["turn_id"]))["progress"] == {
            "waiting": None, "reasoning": "", "searches": [], "sources": {}, "answered": [], "writing": False, "phase": "planning"}


def test_outcome_complete_without_final_answer_and_cap():
    from scientist.runs import _cap, _outcome
    assert _outcome(None, {"type": "complete"}) == {"status": "done"}  # the run loop turns this into error for asks
    from scientist.store import MAX_JSON_BYTES
    big = {"progress": {"reasoning": "x" * (4 * MAX_JSON_BYTES[0] + 1), "searches": [1], "sources": {"a": 1}, "answered": ["a"], "phase": "done"}}
    assert _cap(big)["progress"] == {"reasoning": "", "searches": [], "sources": {}, "answered": [], "phase": "done"}
    ans = {"progress": {"phase": "done"}, "answer": {"content": "y" * (5 * MAX_JSON_BYTES[0])}}
    assert len(_cap(ans)["answer"]["content"]) == 5 * MAX_JSON_BYTES[0]  # never the answer


async def test_rate_limited_submit_is_429_with_code(serve, fake_complete):
    async with serve(STORE_WRITE_RATE_PER_MIN=1) as c:
        sid = await mk_session(c)  # uses the one write
        r = await post(c, chat(sid))
        assert r.status_code == 429 and r.json()["code"] == "rate_limited"


async def test_a_real_finished_run_teaches_the_eta(serve, fake_complete, monkeypatch):
    from scientist import runqueue
    monkeypatch.setattr(runqueue, "MIN_COUNTED_SECONDS", 0)  # the fake run is quick; the path is what matters
    fake_complete["strategy"] = strategy("base editing")
    async with serve() as c:
        sid = await mk_session(c)
        r = await post(c, body(sid), cid="3f0c1d52-8a4e-4b1c-9d3a-2f6b7a8c9d01")
        await until(c, r.json()["run"]["id"], "done")
        q = c.app.state.queue
        assert len(q._durations["research"]) == 1 and q.eta("research", 1) < 180
        await usage.drain()

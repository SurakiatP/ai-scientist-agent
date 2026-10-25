import asyncio
import io
import json
import uuid

import httpx
import psycopg
import pytest
from alembic import command

from scientist import llm, usage
from scientist.config import get_settings
from scientist.events import Complete, Error, FinalAnswer, Refused, Strategy
from scientist.main import create_app
from test_config import ENV
from test_analyze import fakes  # noqa: F401
from test_db import _alembic, newdb, pg  # noqa: F401  (throwaway-Postgres fixtures)
from test_routes_files import env, store  # noqa: F401

u = lambda: str(uuid.uuid4())  # noqa: E731
fid = lambda: uuid.uuid4().hex  # noqa: E731


@pytest.fixture(autouse=True)
def _env(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
async def api(newdb):
    command.upgrade(_alembic(), "head")
    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        c.app, c.db = app, newdb
        yield c
    await app.state.db.close()


JSON = {"content-type": "application/json"}


def sql(db, q, *a):
    with psycopg.connect(host="127.0.0.1", port=db["port"], user="app", password=db["password"], dbname=db["name"], autocommit=True) as c:
        cur = c.execute(q, a)
        return cur.fetchall() if cur.description else None


async def mk_session(api, **kw):
    sid = u()
    r = await api.put(f"/v1/store/sessions/{sid}", json={"title": "t", **kw})
    assert r.status_code == 200, r.text
    return sid


def turn(idx=0, **kw):
    return {"idx": idx, "question": "q?", "mode": "deep", "status": "done", "answer": {"content": "a [1]", "references": []}, **kw}


# --- 503 and unchanged behaviour without a database -----------------------------------------------------------------
@pytest.mark.parametrize("method,path", [("GET", "/v1/store/snapshot"), ("PUT", f"/v1/store/projects/{u()}"),
                                         ("GET", "/v1/store/trash"), ("POST", "/v1/store/import"),
                                         ("GET", "/v1/store/events"), ("GET", "/v1/usage/summary")])
async def test_no_database_is_503(method, path):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://t") as c:
        r = await c.request(method, path, json={})
    assert r.status_code == 503 and r.json() == {"detail": "database not configured"}


async def test_unmigrated_database_is_503_not_500(newdb):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://t") as c:
        r = await c.get("/v1/store/snapshot")
    assert r.status_code == 503 and r.json() == {"detail": "database unavailable"}


# --- migration ---------------------------------------------------------------------------------------------------------
def test_migration_0002_up_down(newdb):
    command.upgrade(_alembic(), "head")
    assert sql(newdb, "select count(*) from turns") == [(0,)]
    with pytest.raises(psycopg.errors.CheckViolation):
        sql(newdb, "insert into projects(id,name) values (%s,%s)", u(), "x" * 121)
    command.downgrade(_alembic(), "0001")
    assert sql(newdb, "select to_regclass('turns')") == [(None,)]
    command.upgrade(_alembic(), "head")


# --- projects / sessions / turns ---------------------------------------------------------------------------------------
async def test_project_crud_version_conflict_and_validation(api):
    pid = u()
    r = await api.put(f"/v1/store/projects/{pid}", json={"name": " Alpha "})
    assert r.status_code == 200 and r.json()["name"] == "Alpha" and r.json()["version"] == 1 and "owner" not in r.json()
    r = await api.put(f"/v1/store/projects/{pid}", json={"name": "Beta", "version": 1})
    assert r.json()["version"] == 2
    r = await api.put(f"/v1/store/projects/{pid}", json={"name": "Stale", "version": 1})
    assert r.status_code == 409 and r.json()["current"]["name"] == "Beta" and r.json()["current"]["version"] == 2
    assert (await api.put(f"/v1/store/projects/{pid}", json={"name": "x" * 121})).status_code == 422
    assert (await api.put(f"/v1/store/projects/{pid}", json={"name": ""})).status_code == 422
    assert (await api.put("/v1/store/projects/not-a-uuid", json={"name": "a"})).status_code == 422
    assert (await api.put(f"/v1/store/projects/{pid}", content=b"{nope", headers=JSON)).status_code == 422
    assert (await api.delete(f"/v1/store/projects/{u()}")).status_code == 404


async def test_session_turn_roundtrip_and_snapshot(api):
    sid, tid = await mk_session(api), u()
    r = await api.put(f"/v1/store/sessions/{sid}/turns/{tid}", json=turn(0, status="running", progress={"step": 1}))
    assert r.status_code == 200 and r.json()["version"] == 1
    r = await api.put(f"/v1/store/sessions/{sid}/turns/{tid}", json=turn(0, version=1, plan=[{"term": "x"}]))
    assert r.json()["version"] == 2
    snap = (await api.get("/v1/store/snapshot")).json()
    s = next(x for x in snap["sessions"] if x["id"] == sid)
    assert [t["id"] for t in s["turns"]] == [tid] and s["turns"][0]["status"] == "done" and s["turns"][0]["plan"] == [{"term": "x"}]
    assert snap["server_time"] and snap["projects"] == [] and snap["files"] == []


async def test_truncate_turns_from_index(api):
    """Editing a message drops that turn and every later one, atomically (the edited question replaces them)."""
    sid = await mk_session(api)
    ids = [u() for _ in range(4)]
    for i, tid in enumerate(ids):
        assert (await api.put(f"/v1/store/sessions/{sid}/turns/{tid}", json=turn(i))).status_code == 200
    r = await api.delete(f"/v1/store/sessions/{sid}/turns/from/2")
    assert r.status_code == 200 and r.json() == {"removed": 2}
    snap = (await api.get("/v1/store/snapshot")).json()
    s = next(x for x in snap["sessions"] if x["id"] == sid)
    assert [t["id"] for t in s["turns"]] == ids[:2]
    # idempotent: nothing left to remove, still 200
    assert (await api.delete(f"/v1/store/sessions/{sid}/turns/from/2")).json() == {"removed": 0}
    # the freed position can be used again by the edited question
    assert (await api.put(f"/v1/store/sessions/{sid}/turns/{u()}", json=turn(2, question="edited"))).status_code == 200


async def test_truncate_turns_validation(api):
    sid = await mk_session(api)
    assert (await api.delete(f"/v1/store/sessions/{sid}/turns/from/-1")).status_code == 422
    assert (await api.delete(f"/v1/store/sessions/{sid}/turns/from/abc")).status_code == 422
    assert (await api.delete(f"/v1/store/sessions/{u()}/turns/from/0")).status_code == 404
    assert (await api.delete("/v1/store/sessions/not-a-uuid/turns/from/0")).status_code == 422
    trashed = await mk_session(api)
    assert (await api.delete(f"/v1/store/sessions/{trashed}")).status_code == 200
    assert (await api.delete(f"/v1/store/sessions/{trashed}/turns/from/0")).status_code == 404


async def test_turn_conflicts_and_limits(api):
    sid, tid = await mk_session(api), u()
    put = lambda t, b, s=sid: api.put(f"/v1/store/sessions/{s}/turns/{t}", json=b)  # noqa: E731
    assert (await put(tid, turn(0, version=5))).json()["version"] == 1  # M3: the server owns the version
    assert (await put(tid, turn(0, version=1))).json()["version"] == 2  # equal to stored: accepted, bumped server-side
    r = await put(tid, turn(0, version=1))  # stale
    assert r.status_code == 409 and r.json()["current"]["version"] == 2
    assert (await put(u(), turn(0))).status_code == 409  # position taken by another turn
    assert (await put(u(), turn(1, mode="bogus"))).status_code == 422
    assert (await put(u(), turn(1, status="bogus"))).status_code == 422
    assert (await put(u(), turn(1, question="q" * 4001))).status_code == 422
    assert (await put(u(), turn(1, answer={"content": "c" * 60001}))).status_code == 422
    assert (await put(u(), turn(1, answer={"content": "c", "references": [{}] * 101}))).status_code == 422
    assert (await put(u(), turn(1000))).status_code == 422
    assert (await put(u(), turn(1), s=u())).status_code == 404  # unknown session
    assert (await put(tid, turn(0), s=await mk_session(api))).status_code == 409  # turn of another session


async def test_session_with_unknown_project_422_and_trashed_session_put_409(api):
    assert (await api.put(f"/v1/store/sessions/{u()}", json={"title": "t", "project_id": u()})).status_code == 422
    sid = await mk_session(api)
    await api.delete(f"/v1/store/sessions/{sid}")
    r = await api.put(f"/v1/store/sessions/{sid}", json={"title": "again"})
    assert r.status_code == 409 and r.json()["current"]["deleted_at"]


async def test_soft_delete_trash_restore_and_permanent(api):
    sid = await mk_session(api)
    await api.put(f"/v1/store/sessions/{sid}/turns/{u()}", json=turn())
    assert (await api.delete(f"/v1/store/sessions/{sid}", params={"permanent": 1})).status_code == 409  # not trashed yet
    assert (await api.delete(f"/v1/store/sessions/{sid}")).status_code == 200
    assert (await api.delete(f"/v1/store/sessions/{sid}")).status_code == 200  # idempotent
    assert sid not in [s["id"] for s in (await api.get("/v1/store/snapshot")).json()["sessions"]]
    assert sid in [s["id"] for s in (await api.get("/v1/store/trash")).json()["sessions"]]
    r = await api.post(f"/v1/store/sessions/{sid}/restore", json={})
    assert r.status_code == 200 and r.json()["deleted_at"] is None
    s = next(x for x in (await api.get("/v1/store/snapshot")).json()["sessions"] if x["id"] == sid)
    assert len(s["turns"]) == 1  # turns survive trash and restore
    await api.delete(f"/v1/store/sessions/{sid}")
    assert (await api.delete(f"/v1/store/sessions/{sid}", params={"permanent": 1})).status_code == 200
    assert sql(api.db, "select count(*) from turns") == [(0,)]  # cascade
    assert (await api.post(f"/v1/store/sessions/{sid}/restore", json={})).status_code == 404


async def test_purge_removes_only_older_than_7_days(api):
    old, new = await mk_session(api), await mk_session(api)
    keep = await mk_session(api)
    for s in (old, new):
        await api.delete(f"/v1/store/sessions/{s}")
    sql(api.db, "update sessions set deleted_at = now() - interval '8 days' where id=%s", old)
    sql(api.db, "update sessions set deleted_at = now() - interval '6 days' where id=%s", new)
    trash = (await api.get("/v1/store/trash")).json()
    assert [s["id"] for s in trash["sessions"]] == [new]  # 8-day-old row is already outside the window
    r = await api.post("/v1/store/trash/purge", json={})
    assert r.json()["sessions"] == 1
    assert {r[0] for r in sql(api.db, "select id::text from sessions")} == {new, keep}


async def test_snapshot_does_not_purge_and_limits(api):
    ids = [await mk_session(api) for _ in range(3)]
    await api.delete(f"/v1/store/sessions/{ids[0]}")
    sql(api.db, "update sessions set deleted_at = now() - interval '9 days' where id=%s", ids[0])
    snap = (await api.get("/v1/store/snapshot", params={"limit_sessions": 1})).json()
    assert len(snap["sessions"]) == 1 and snap["sessions"][0]["id"] == ids[2]  # newest first
    assert sql(api.db, "select count(*) from sessions where id=%s", ids[0]) == [(1,)]  # I2: GET never deletes
    assert (await api.post("/v1/store/trash/purge", json={})).json()["sessions"] == 1
    assert (await api.get("/v1/store/snapshot", params={"limit_sessions": 0})).status_code == 422


async def test_project_delete_moves_sessions_and_files_to_personal(api):
    pid = u()
    await api.put(f"/v1/store/projects/{pid}", json={"name": "P"})
    sid = await mk_session(api, project_id=pid)
    f = fid()
    assert (await api.put(f"/v1/store/files/{f}", json={"name": "a.csv", "size": 3, "kind": "csv", "project_id": pid})).status_code == 200
    assert (await api.delete(f"/v1/store/projects/{pid}")).status_code == 200
    snap = (await api.get("/v1/store/snapshot")).json()
    assert snap["projects"] == [] and next(s for s in snap["sessions"] if s["id"] == sid)["project_id"] is None
    assert snap["files"][0]["project_id"] is None and snap["sessions"][0]["version"] == 2
    assert pid in [p["id"] for p in (await api.get("/v1/store/trash")).json()["projects"]]
    assert (await api.put(f"/v1/store/sessions/{sid}", json={"title": "x", "project_id": pid})).status_code == 422  # trashed project


async def test_files_register_delete_restore_and_purge_drops_object(api):
    dropped = []

    class Obj:
        async def delete(self, key):
            dropped.append(key)
    api.app.state.store = Obj()
    f = fid()
    assert (await api.put(f"/v1/store/files/{f}", json={"name": "a.csv", "size": 3})).json()["kind"] == ""
    assert (await api.put(f"/v1/store/files/{f}", json={"name": "b.csv", "size": 3, "version": 1})).json()["name"] == "b.csv"
    assert (await api.put("/v1/store/files/XYZ", json={"name": "a"})).status_code == 422
    await api.delete(f"/v1/store/files/{f}")
    assert dropped == []  # object stays until purge
    assert (await api.post(f"/v1/store/files/{f}/restore", json={})).json()["deleted_at"] is None
    await api.delete(f"/v1/store/files/{f}")
    sql(api.db, "update files set deleted_at = now() - interval '8 days'")
    assert (await api.post("/v1/store/trash/purge", json={})).json()["files"] == 1
    assert dropped == [f]


async def test_hostile_text_is_stored_verbatim(api):
    evil = "'); DROP TABLE sessions; --\x00x".replace("\x00", "")
    sid = await mk_session(api, title=evil)
    await api.put(f"/v1/store/sessions/{sid}/turns/{u()}", json=turn(question=evil, answer={"content": evil, "references": [{"title": evil}]}))
    s = next(x for x in (await api.get("/v1/store/snapshot")).json()["sessions"] if x["id"] == sid)
    assert s["title"] == evil and s["turns"][0]["question"] == evil and s["turns"][0]["answer"]["references"][0]["title"] == evil
    assert sql(api.db, "select count(*) from sessions") == [(1,)]


async def test_oversized_body_413(api):
    r = await api.put(f"/v1/store/projects/{u()}", content=b'{"name":"' + b"a" * 1_100_000 + b'"}', headers=JSON)
    assert r.status_code == 413
    r = await api.post("/v1/store/import", content=b'{"sessions":[]' + b" " * 10_100_000 + b"}", headers=JSON)
    assert r.status_code == 413


async def test_write_rate_limit(monkeypatch, newdb):
    command.upgrade(_alembic(), "head")
    monkeypatch.setenv("STORE_WRITE_RATE_PER_MIN", "3")
    get_settings.cache_clear()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://t") as c:
        codes = [(await c.put(f"/v1/store/projects/{u()}", json={"name": "a"})).status_code for _ in range(5)]
        assert (await c.get("/v1/store/snapshot")).status_code == 200  # reads are not limited
    assert codes == [200, 200, 200, 429, 429]


# --- import ----------------------------------------------------------------------------------------------------------------
async def test_import_idempotent_and_clamped(api, monkeypatch):
    pid, sid, f = u(), u(), fid()
    body = {"projects": [{"id": pid, "name": "P" * 300}, {"id": "bad", "name": "x"}],
            "sessions": [{"id": sid, "title": "T" * 500, "project_id": pid, "created_at": 1700000000000,
                          "turns": [{"question": "q" * 9000, "status": "done", "mode": "quick",
                                     "answer": {"content": "c" * 70000, "references": [{}] * 150}},
                                    {"question": "bad status", "status": "zzz"}]},
                         {"id": u(), "title": "orphan", "project_id": u(), "turns": "nonsense"}],
            "files": [{"id": f, "name": "n" * 200, "size": 5, "kind": "csv"}, {"id": "short", "name": "x"}]}
    r = await api.post("/v1/store/import", json=body)
    assert r.json() == {"projects": 1, "sessions": 2, "turns": 1, "files": 1, "skipped": 3}
    snap = (await api.get("/v1/store/snapshot")).json()
    s = next(x for x in snap["sessions"] if x["id"] == sid)
    t = s["turns"][0]
    assert len(s["title"]) == 200 and len(snap["projects"][0]["name"]) == 120 and len(snap["files"][0]["name"]) == 120
    assert len(t["question"]) == 4000 and len(t["answer"]["content"]) == 60000 and len(t["answer"]["references"]) == 100
    assert s["project_id"] == pid and s["created_at"].startswith("2023-11-14")
    assert next(x for x in snap["sessions"] if x["title"] == "orphan")["project_id"] is None
    again = (await api.post("/v1/store/import", json=body)).json()
    assert (again["projects"], again["sessions"], again["turns"], again["files"]) == (0, 0, 0, 0)
    assert len((await api.get("/v1/store/snapshot")).json()["sessions"]) == 2
    assert (await api.post("/v1/store/import", json=[1])).status_code == 422


async def test_import_caps_sessions(api, monkeypatch):
    monkeypatch.setenv("STORE_MAX_SESSIONS", "2")
    get_settings.cache_clear()
    api.app.state.data.settings = get_settings()
    r = await api.post("/v1/store/import", json={"sessions": [{"id": u(), "title": str(i)} for i in range(5)]})
    assert r.json()["sessions"] == 2 and r.json()["skipped"] == 3


# --- SSE ---------------------------------------------------------------------------------------------------------------------
async def read_events(app, n, trigger):
    chunks: asyncio.Queue = asyncio.Queue()
    gone = asyncio.Event()

    async def receive():
        await gone.wait()
        return {"type": "http.disconnect"}

    async def send(msg):
        if msg.get("body"):
            await chunks.put(msg["body"].decode())
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET", "scheme": "http",
             "path": "/v1/store/events", "raw_path": b"/v1/store/events", "query_string": b"", "root_path": "",
             "headers": [(b"host", b"t")], "client": ("127.0.0.1", 1), "server": ("t", 80)}
    task = asyncio.create_task(app(scope, receive, send))
    assert await asyncio.wait_for(chunks.get(), 5) == ": ok\n\n"
    await trigger()
    got = []
    while len(got) < n:
        c = await asyncio.wait_for(chunks.get(), 5)
        if c.startswith("data: "):
            got.append(json.loads(c[6:]))
    gone.set()
    await asyncio.wait_for(task, 5)
    return got


async def test_sse_emits_changed_per_write_and_unsubscribes(api):
    sid, tid = u(), u()

    async def trigger():
        await api.put(f"/v1/store/sessions/{sid}", json={"title": "t"})
        await api.put(f"/v1/store/sessions/{sid}/turns/{tid}", json=turn())
        await api.delete(f"/v1/store/sessions/{sid}")
    got = await read_events(api.app, 3, trigger)
    assert [(e["entity"], e["id"]) for e in got] == [("session", sid), ("turn", tid), ("session", sid)]
    assert all(e["type"] == "changed" and e["at"] for e in got) and got[1]["session_id"] == sid
    assert api.app.state.data.bus.subs == set()


async def test_sse_heartbeat(monkeypatch, newdb):
    command.upgrade(_alembic(), "head")
    monkeypatch.setenv("SSE_PING_SECONDS", "0.05")
    get_settings.cache_clear()
    app = create_app()
    chunks: list[str] = []
    gone = asyncio.Event()

    async def receive():
        await gone.wait()
        return {"type": "http.disconnect"}

    async def send(msg):
        if msg.get("body"):
            chunks.append(msg["body"].decode())
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET", "scheme": "http",
             "path": "/v1/store/events", "raw_path": b"/v1/store/events", "query_string": b"", "root_path": "",
             "headers": [(b"host", b"t")], "client": ("127.0.0.1", 1), "server": ("t", 80)}
    task = asyncio.create_task(app(scope, receive, send))
    await asyncio.sleep(0.4)
    gone.set()
    await asyncio.wait_for(task, 5)
    assert chunks.count(": ping\n\n") >= 2
    await app.state.db.close()


async def test_hourly_purge_task_cancelled_cleanly_on_shutdown(newdb):
    command.upgrade(_alembic(), "head")
    class Rt:
        async def close(self):
            pass
    app = create_app(runner=Rt(), client=httpx.AsyncClient())
    async with app.router.lifespan_context(app):
        pass  # lifespan exit must cancel the purge task without error
    await asyncio.sleep(0)
    assert not [t for t in asyncio.all_tasks() if "_purge_hourly" in repr(t)]


# --- usage ---------------------------------------------------------------------------------------------------------------------
def rows(db):
    return sql(db, "select mode, ok, llm_calls, prompt_tokens, completion_tokens, cost_usd, phase_seconds from usage_events order by id")


async def run_tracked(db, events, mode="deep"):
    out = [e async for e in usage.track(events, mode=mode, db=db)]
    await usage.drain()
    return out


async def test_track_records_phases_calls_and_ok(api):
    async def events():
        async def fake(*a, **k):
            return llm.LlmResult(text="x", prompt_tokens=10, completion_tokens=5, cached_tokens=0, cost_usd=0.002)
        client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={
            "choices": [{"message": {"content": "hi"}}], "usage": {"prompt_tokens": 10, "completion_tokens": 5, "cost": 0.002}})))
        llm._transport = client._transport
        try:
            await llm.complete("s", "u", max_tokens=5)
            await llm.complete("s", "u", max_tokens=5)
        finally:
            llm._transport = None
        yield Strategy(reasoning="", searches=[])
        yield FinalAnswer(content="a", references=[])
        yield Complete()
    out = await run_tracked(api.app.state.db, events())
    assert [e.type for e in out] == ["strategy", "final_answer", "complete"]
    (mode, ok, calls, pt, ct, cost, phases), = rows(api.db)
    assert (mode, ok, calls, pt, ct) == ("deep", True, 2, 20, 10) and float(cost) == 0.004
    assert set(phases) == {"strategy", "synthesis", "other"}


@pytest.mark.parametrize("last,ok", [(Error(message="x"), False), (Refused(reason="r"), True)])
async def test_track_failure_and_refusal(api, last, ok):
    async def events():
        yield last
    await run_tracked(api.app.state.db, events(), mode="quick")
    assert [(r[0], r[1], r[2]) for r in rows(api.db)] == [("quick", ok, 0)]


async def test_track_disconnect_is_not_ok(api):
    async def events():
        yield Strategy(reasoning="", searches=[])
        await asyncio.sleep(30)
    g = usage.track(events(), mode="chat", db=api.app.state.db)
    await anext(g)
    await g.aclose()
    await usage.drain()
    assert [(r[0], r[1]) for r in rows(api.db)] == [("chat", False)]


async def test_usage_write_failure_never_breaks_the_run(api):
    class Broken:
        def session(self):
            raise psycopg.OperationalError("db gone")

    async def events():
        yield Complete()
    out = await run_tracked(Broken(), events())
    assert [e.type for e in out] == ["complete"]


async def test_summary(api):
    async def ev(*es):
        for e in es:
            yield e
    await run_tracked(api.app.state.db, ev(Strategy(reasoning="", searches=[]), Complete()))
    await run_tracked(api.app.state.db, ev(Error(message="x")), mode="quick")
    s = (await api.get("/v1/usage/summary", params={"days": 7})).json()
    assert s["days"] == 7 and s["modes"]["deep"]["count"] == 1 and s["modes"]["deep"]["ok_rate"] == 1.0
    assert s["modes"]["quick"]["ok_rate"] == 0.0 and s["modes"]["deep"]["p95_seconds"] is not None
    assert (await api.get("/v1/usage/summary", params={"days": 0})).status_code == 422


# --- usage through the real routes -----------------------------------------------------------------------------------------
async def test_ask_and_analyze_routes_write_usage_rows(env, store, fakes, newdb, tmp_path, fake_complete, monkeypatch):  # noqa: F811
    from test_analyze import GOOD, analyze
    from test_pipeline import FAKE, Q, answer, crossref, paper, strategy
    from scientist.hermes import HermesRuntime
    import sys
    script = tmp_path / "script.json"
    script.write_text(json.dumps({"*": [paper("BE4", "10.1000/be4"), answer("BE4 works")]}))
    orig = store.put

    async def put(key, body, **kw):  # MemStore only knows file objects
        await orig(key, io.BytesIO(body) if isinstance(body, bytes) else body, **kw)
    store.put = put
    command.upgrade(_alembic(), "head")
    fake_complete["strategy"] = strategy("base editing")
    rt = HermesRuntime(get_settings(), command=[sys.executable, FAKE, str(script)])
    app = create_app(runner=rt, client=crossref(), store=store)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            assert (await c.post("/v1/async/ask", json={"question": Q, "mode": "deep"})).status_code == 200
            assert (await c.post("/v1/async/ask", json={"question": Q, "mode": "quick"})).status_code == 200
            mem = [{"question": "q", "answer": "a [1]", "references": []}]
            assert (await c.post("/v1/async/ask", json={"question": Q, "mode": "chat", "memory": mem})).status_code == 200
            ask_complete = llm.complete

            async def analysis_complete(*a, **k):
                return llm.LlmResult(text=GOOD, prompt_tokens=1, completion_tokens=1, cached_tokens=0)
            monkeypatch.setattr(llm, "complete", analysis_complete)
            ev = await analyze(c, store)
            monkeypatch.setattr(llm, "complete", ask_complete)
            assert ev[-1]["type"] == "complete", ev
        await usage.drain()
        r = sql(newdb, "select mode, ok, papers_found from usage_events order by id")
        # rows are written by background tasks, so their order is not the request order
        assert sorted((m, o) for m, o, _ in r) == sorted([("deep", True), ("quick", True), ("chat", True), ("analysis", True)])
        assert [p for m, _, p in r if m == "deep"] == [1]
        # a database that fails on every write must not touch the run
        app.state.db.session = lambda: (_ for _ in ()).throw(psycopg.OperationalError("down"))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            r = await c.post("/v1/async/ask", json={"question": Q, "mode": "quick"})
        assert r.status_code == 200 and '"complete"' in r.text
        await usage.drain()
    await app.state.db.close()


# --- final review fixes (I1-I5, M1-M11) --------------------------------------------------------------------------------
async def test_i1_non_json_content_type_rejected_on_every_write(api):
    sid, pid, f = await mk_session(api), u(), fid()
    for method, path in [("PUT", f"/v1/store/projects/{pid}"), ("POST", "/v1/store/import"), ("POST", "/v1/store/trash/purge"),
                         ("POST", f"/v1/store/sessions/{sid}/restore"), ("PUT", f"/v1/store/sessions/{sid}/turns/{u()}"),
                         ("PUT", f"/v1/store/files/{f}")]:
        for ct in ("text/plain", "application/x-www-form-urlencoded", "multipart/form-data"):
            r = await api.request(method, path, content=b'{"name":"x"}', headers={"content-type": ct})
            assert r.status_code == 415, (method, path, ct)
    assert (await api.put(f"/v1/store/projects/{pid}", content=b'{"name":"x"}')).status_code == 415  # no header at all
    assert (await api.put(f"/v1/store/projects/{pid}", json={"name": "ok"})).status_code == 200


async def test_i1_origin_checked_only_when_configured(api):
    pid = u()
    h = {"origin": "https://evil.example"}
    assert (await api.put(f"/v1/store/projects/{pid}", json={"name": "a"}, headers=h)).status_code == 200  # default: no check
    api.app.state.settings.allowed_origins = ["https://ok.example"]
    assert (await api.put(f"/v1/store/projects/{pid}", json={"name": "b"}, headers=h)).status_code == 403
    assert (await api.put(f"/v1/store/projects/{pid}", json={"name": "b"}, headers={"origin": "https://ok.example"})).status_code == 200


async def test_i2_snapshot_returns_newest_turns_and_counts(api, monkeypatch):
    api.app.state.settings.max_turns_per_session = 3
    sid = await mk_session(api)
    ids = [u() for _ in range(5)]
    for i, t in enumerate(ids):
        assert (await api.put(f"/v1/store/sessions/{sid}/turns/{t}", json=turn(i))).status_code == 200
    s = next(x for x in (await api.get("/v1/store/snapshot")).json()["sessions"] if x["id"] == sid)
    assert [t["id"] for t in s["turns"]] == ids[2:] and s["turn_count"] == 5 and s["has_more_turns"] is True


async def test_i2_turn_count_cap_and_json_size_cap(api):
    api.app.state.settings.store_max_turns = 2
    sid = await mk_session(api)
    for i in range(2):
        assert (await api.put(f"/v1/store/sessions/{sid}/turns/{u()}", json=turn(i))).status_code == 200
    assert (await api.put(f"/v1/store/sessions/{sid}/turns/{u()}", json=turn(2))).status_code == 409
    sid = await mk_session(api)
    big = {"x": "a" * 200_001}
    for k in ("progress", "plan", "analysis"):
        assert (await api.put(f"/v1/store/sessions/{sid}/turns/{u()}", json=turn(0, **{k: big}))).status_code == 422
    assert (await api.put(f"/v1/store/sessions/{sid}/turns/{u()}", json=turn(0, answer={"content": "c", "references": [], "x": big}))).status_code == 422


async def test_i3_import_clamps_timestamps(api):
    sid = u()
    r = await api.post("/v1/store/import", json={"sessions": [{"id": sid, "title": "far", "updated_at": "9999-01-01T00:00:00Z", "created_at": "1970-01-01T00:00:00Z"}]})
    assert r.status_code == 200
    (up, cr), = sql(api.db, "select updated_at, created_at from sessions where id=%s", sid)
    now = sql(api.db, "select now()")[0][0]
    assert up <= now and cr.year >= 2000


async def test_i5_stale_put_on_truncated_turn_is_gone(api):
    sid = await mk_session(api)
    old = [u() for _ in range(2)]
    for i, t in enumerate(old):
        await api.put(f"/v1/store/sessions/{sid}/turns/{t}", json=turn(i))
    assert (await api.delete(f"/v1/store/sessions/{sid}/turns/from/1")).json() == {"removed": 1}
    assert (await api.put(f"/v1/store/sessions/{sid}/turns/{old[1]}", json=turn(1))).status_code == 410  # B is stale
    assert (await api.put(f"/v1/store/sessions/{sid}/turns/{u()}", json=turn(1, question="edited"))).status_code == 200
    sql(api.db, "update turn_tombstones set created_at = now() - interval '9 days'")
    assert (await api.post("/v1/store/trash/purge", json={})).json()["tombstones"] == 1


async def test_m6_deep_json_is_422(api):
    r = await api.put(f"/v1/store/projects/{u()}", content=b"[" * 100_000, headers=JSON)
    assert r.status_code == 422


async def test_m7_file_size_bound(api):
    r = await api.put(f"/v1/store/files/{fid()}", json={"name": "a.csv", "size": 2**63, "kind": "csv"})
    assert r.status_code == 422


async def test_m9_usage_retention(api):
    sql(api.db, "insert into usage_events(at, mode, ok) values (now() - interval '200 days', 'deep', true), (now(), 'deep', true)")
    assert await api.app.state.data.purge_usage() == 1

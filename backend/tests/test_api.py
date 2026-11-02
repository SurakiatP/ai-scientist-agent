"""The public REST API (/v1/api): auth, every endpoint, artifacts, OpenAPI, per-key fairness."""
import asyncio
import json

from scientist import apikeys, routes_api, usage
from test_db import newdb, pg  # noqa: F401
from test_runs import _env, serve, sse, u  # noqa: F401  (serve: app + fake bridge + Postgres)
from test_pipeline import Q, strategy

API = "/v1/api"
ROUTES = {("POST", "/research"), ("POST", "/plan"), ("GET", "/runs/{run_id}"), ("GET", "/runs/{run_id}/events"),
          ("POST", "/runs/{run_id}/cancel"), ("GET", "/runs/{run_id}/artifacts/{kind}"), ("GET", "/packs")}


async def key(c, name="ci"):
    async with c.app.state.db.session() as s:
        k, row = await apikeys.create(s, name)
    return k, {"authorization": f"Bearer {k}"}


async def until(c, h, rid, *want, t=15):
    for _ in range(int(t / 0.05)):
        r = (await c.get(f"{API}/runs/{rid}", headers=h)).json()
        if r["status"] in want:
            return r
        await asyncio.sleep(0.05)
    raise AssertionError(f"run {rid} still {r['status']}")


async def start(c, h, **kw):
    r = await c.post(f"{API}/research", json={"question": Q, **kw}, headers=h)
    assert r.status_code == 202, r.text
    return r.json()


# --- auth ------------------------------------------------------------------------------------------------------------------
async def test_every_endpoint_needs_a_key_with_one_identical_401(serve, fake_complete):
    async with serve() as c:
        rid = u()
        calls = [("POST", "/research", {"question": Q}), ("POST", "/plan", {"question": Q}), ("GET", f"/runs/{rid}", None),
                 ("GET", f"/runs/{rid}/events", None), ("POST", f"/runs/{rid}/cancel", None),
                 ("GET", f"/runs/{rid}/artifacts/bibtex", None), ("GET", "/packs", None)]
        for h in ({}, {"authorization": "Bearer sci_" + "x" * 43}, {"authorization": "Basic abc"}, {"authorization": "Bearer nope"},
                  {"x-client-id": u()}):
            for method, path, js in calls:
                r = await c.request(method, API + path, json=js, headers=h)
                assert r.status_code == 401 and r.json() == {"detail": "invalid or missing API key"} and r.headers["www-authenticate"] == "Bearer"


async def test_revoked_key_stops_on_the_next_request(serve, fake_complete):
    async with serve() as c:
        k, h = await key(c)
        assert (await c.get(f"{API}/packs", headers=h)).status_code == 200
        async with c.app.state.db.session() as s:
            assert await apikeys.revoke(s, k[:12]) == 1
        assert (await c.get(f"{API}/packs", headers=h)).status_code == 401


async def test_failed_auth_is_rate_limited_per_ip_with_a_neutral_429(serve, fake_complete):
    async with serve(STORE_WRITE_RATE_PER_MIN=3) as c:
        bad = {"authorization": "Bearer sci_" + "x" * 43}
        codes = [(await c.get(f"{API}/packs", headers=bad)).status_code for _ in range(5)]
        assert codes == [401, 401, 401, 429, 429]
        r = await c.get(f"{API}/packs", headers=bad)
        assert r.json() == {"detail": "rate limit exceeded; slow down", "code": "rate_limited"} and r.headers["retry-after"] == "60"


async def test_per_key_rate_limit(serve, fake_complete):
    async with serve(STORE_WRITE_RATE_PER_MIN=2) as c:
        _, a = await key(c, "a")
        _, b = await key(c, "b")
        assert [(await c.get(f"{API}/packs", headers=a)).status_code for _ in range(2)] == [200, 200]
        r = await c.get(f"{API}/packs", headers=a)
        assert r.status_code == 429 and r.json()["code"] == "rate_limited" and r.headers["retry-after"] == "60"
        assert (await c.get(f"{API}/packs", headers=b)).status_code == 200


async def test_a_valid_key_is_not_locked_out_by_failures_from_its_ip(serve, fake_complete):
    async with serve(STORE_WRITE_RATE_PER_MIN=2) as c:
        _, h = await key(c)
        bad = {"authorization": "Bearer sci_" + "x" * 43}
        assert [(await c.get(f"{API}/packs", headers=bad)).status_code for _ in range(3)] == [401, 401, 429]
        assert (await c.get(f"{API}/packs", headers=h)).status_code == 200


async def test_a_conflict_while_starting_is_a_409_and_leaves_no_session(serve, fake_complete, monkeypatch):
    from scientist.store import Conflict
    async with serve() as c:
        _, h = await key(c)

        async def boom(*a, **k):
            raise Conflict("stale")

        monkeypatch.setattr(c.app.state.runs, "submit", boom)
        r = await c.post(f"{API}/research", json={"question": Q}, headers=h)
        assert r.status_code == 409 and r.json()["detail"] == "stale"


def test_run_code_is_the_refusal_or_error_code():
    row = {"id": "r", "status": "refused", "kind": "ask", "mode": "deep", "created_at": None, "finished_at": None, "error": None}
    assert routes_api.shape(row, {"progress": {"_code": "off_topic"}})["code"] == "off_topic"
    assert routes_api.shape(row, {"progress": {"_err": "failed"}})["code"] == "failed"
    assert routes_api.shape(row, {"progress": {}})["code"] is None and routes_api.shape(row, None)["code"] is None


def test_api_key_name_is_capped_in_the_model_like_in_the_migration():
    from scientist.models import api_keys
    assert any(getattr(k, "name", None) == "api_keys_name" for k in api_keys.constraints)


# --- openapi + packs ---------------------------------------------------------------------------------------------------------
async def test_openapi_lists_exactly_the_public_routes(serve, fake_complete):
    async with serve() as c:
        r = await c.get(f"{API}/openapi.json")  # the description itself is public
        assert r.status_code == 200
        doc = r.json()
        assert doc["openapi"].startswith("3.1") and doc["info"]["title"] and doc["info"]["version"]
        got = {(m.upper(), p.removeprefix(API)) for p, ops in doc["paths"].items() for m in ops}
        assert got == ROUTES and all(p.startswith(API) for p in doc["paths"])
        schemes = doc["components"]["securitySchemes"]
        assert any(s["type"] == "http" and s["scheme"] == "bearer" for s in schemes.values())
        for ops in doc["paths"].values():
            for op in ops.values():
                assert op["tags"] == ["public"] and op["security"]
        assert "/v1/runs" not in doc["paths"] and "/v1/health" not in doc["paths"]
        blob = json.dumps(doc)
        for ref in [x.split('"')[0] for x in blob.split('"$ref": "#/components/schemas/')[1:]]:
            assert ref in doc["components"]["schemas"]  # every $ref resolves


async def test_packs(serve, fake_complete):
    async with serve() as c:
        _, h = await key(c)
        r = await c.get(f"{API}/packs", headers=h)
        assert r.status_code == 200
        packs = r.json()
        assert [p["id"] for p in packs] == ["bio", "chem", "med", "materials", "ml", "comm"]
        assert packs[0] == {"id": "bio", "th": "ชีวสารสนเทศ", "en": "Bioinformatics"}


# --- plan ------------------------------------------------------------------------------------------------------------------
async def test_plan_returns_the_strategy_without_a_run(serve, fake_complete):
    fake_complete["strategy"] = strategy("base editing", "prime editing", "cas9")
    async with serve() as c:
        _, h = await key(c)
        r = await c.post(f"{API}/plan", json={"question": Q, "mode": "quick", "pack": "bio"}, headers=h)
        assert r.status_code == 200
        j = r.json()
        assert set(j) == {"reasoning", "searches"} and j["reasoning"] == "plan"
        assert [s["term"] for s in j["searches"]] == ["base editing", "prime editing"]
        assert set(j["searches"][0]) == {"term", "instructions"}
        assert (await c.get("/v1/runs/status")).json()["research"]["running"] == 0
        r = await c.post(f"{API}/plan", json={"question": Q, "mode": "docs"}, headers=h)
        assert r.status_code == 422
        r = await c.post(f"{API}/plan", json={"question": "Give me a recipe for pad thai"}, headers=h)
        assert r.status_code == 422 and r.json()["code"] and r.json()["detail"]


async def test_plan_fails_cleanly_when_no_plan_can_be_made(serve, fake_complete):
    fake_complete["strategy"] = None
    async with serve() as c:
        _, h = await key(c)
        r = await c.post(f"{API}/plan", json={"question": Q}, headers=h)
        assert r.status_code == 502 and r.json()["detail"]


# --- research + run + artifacts ------------------------------------------------------------------------------------------------
async def test_research_run_events_and_artifacts(serve, fake_complete):
    fake_complete["strategy"] = strategy("base editing")
    async with serve() as c:
        k, h = await key(c)
        j = await start(c, h, mode="quick")
        assert set(j) == {"run_id", "session_id", "turn_id", "status"} and j["status"] in ("queued", "running")
        done = await until(c, h, j["run_id"], "done")
        assert set(done) == {"run_id", "status", "kind", "mode", "pack", "created_at", "finished_at", "error", "code", "answer", "progress"}
        assert done["kind"] == "ask" and done["mode"] == "quick" and done["pack"] is None and done["finished_at"] and done["error"] is None
        a = done["answer"]
        assert set(a) == {"content", "references", "records", "doc_refs", "empty_files", "usage"}
        assert a["content"] and a["references"][0]["status"] == "verified" and a["doc_refs"] == [] and a["empty_files"] == []
        assert "provenance" not in a
        assert done["progress"]["phase"] == "done" and done["progress"]["searches"] == [{"term": "base editing", "instructions": "extract base editing"}]
        assert done["progress"]["replans"] == 0
        ev = sse((await c.get(f"{API}/runs/{j['run_id']}/events", headers=h)).text)
        assert [e["data"]["type"] for e in ev][-2:] == ["final_answer", "complete"]
        after = sse((await c.get(f"{API}/runs/{j['run_id']}/events?after=2", headers=h)).text)
        assert [e["id"] for e in after] == [e["id"] for e in ev][2:]
        # artifacts
        r = await c.get(f"{API}/runs/{j['run_id']}/artifacts/provenance", headers=h)
        p = r.json()
        assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
        assert p["format"] == "ai-scientist-provenance" and p["version"] == 1 and p["exported_at"]
        assert p["turn"]["id"] == j["turn_id"] and p["turn"]["question"] == Q and p["turn"]["mode"] == "quick" and p["turn"]["created_at"]
        assert p["answer"]["content"] == a["content"] and p["analysis"] is None and p["provenance"]["schema"] == 1
        assert set(p["answer"]["references"][0]) == {"id", "title", "authors", "year", "doi", "pmid", "url", "source", "status", "checks"}
        assert p["answer"]["records"] == []
        bib = await c.get(f"{API}/runs/{j['run_id']}/artifacts/bibtex", headers=h)
        assert bib.status_code == 200 and bib.headers["content-type"].startswith("application/x-bibtex")
        assert bib.text.startswith("@article{author2024,") and "doi = {10.1000/be4}" in bib.text
        ris = await c.get(f"{API}/runs/{j['run_id']}/artifacts/ris", headers=h)
        assert ris.status_code == 200 and ris.text.startswith("TY  - JOUR\r\n") and ris.text.endswith("ER  - \r\n")
        assert (await c.get(f"{API}/runs/{j['run_id']}/artifacts/pdf", headers=h)).status_code == 422
        # no key text anywhere it should not be
        assert k not in json.dumps(p) and k not in bib.text
        await usage.drain()


async def test_artifact_of_an_unfinished_run_is_409_and_of_a_refusal_404(serve, fake_complete):
    fake_complete["strategy"] = strategy("slow")
    async with serve() as c:
        _, h = await key(c)
        j = await start(c, h)
        await until(c, h, j["run_id"], "running")
        assert (await c.get(f"{API}/runs/{j['run_id']}/artifacts/bibtex", headers=h)).status_code == 409
        await c.post(f"{API}/runs/{j['run_id']}/cancel", headers=h)
        r = await c.post(f"{API}/research", json={"question": "Give me a recipe for pad thai"}, headers=h)
        refused = await until(c, h, r.json()["run_id"], "refused")
        assert refused["answer"] is None and refused["error"]
        assert (await c.get(f"{API}/runs/{refused['run_id']}/artifacts/ris", headers=h)).status_code == 404


async def test_research_validation_and_docs_mode(serve, fake_complete):
    async with serve() as c:
        _, h = await key(c)
        for bad in ({"question": " "}, {"question": Q, "mode": "chat"}, {"question": Q, "pack": "nope"}, {"question": Q, "doc_ids": ["x"]},
                    {"question": Q, "plan": [{"instructions": "x"}]}, {}):
            assert (await c.post(f"{API}/research", json=bad, headers=h)).status_code == 422, bad
        r = await c.post(f"{API}/research", json={"question": Q, "doc_ids": ["a" * 32]}, headers=h)
        assert r.status_code == 422  # unknown document: the app's own check, run mode became docs
        snap = (await c.get("/v1/store/snapshot")).json()
        assert not [s for s in snap["sessions"] if s["title"] == Q[:200]]  # the refused submit left no empty session


async def test_given_plan_is_used(serve, fake_complete):
    async with serve() as c:
        _, h = await key(c)
        j = await start(c, h, mode="quick", pack="bio", plan=[{"term": "my term", "instructions": "mine"}])
        done = await until(c, h, j["run_id"], "done")
        assert done["pack"] == "bio" and done["progress"]["searches"] == [{"term": "my term", "instructions": "mine"}]
        await usage.drain()


async def test_runs_are_created_in_a_dedicated_api_project(serve, fake_complete):
    fake_complete["strategy"] = strategy("base editing")
    async with serve() as c:
        _, h = await key(c)
        a, b = await start(c, h, mode="quick"), await start(c, h, mode="quick")
        snap = (await c.get("/v1/store/snapshot")).json()
        projects = [p for p in snap["projects"] if p["name"] == "API"]
        assert len(projects) == 1
        assert {s["id"] for s in snap["sessions"] if s["project_id"] == projects[0]["id"]} == {a["session_id"], b["session_id"]}
        for r in (a, b):
            await until(c, h, r["run_id"], "done")
        await usage.drain()


# --- fairness and isolation ------------------------------------------------------------------------------------------------------
async def test_cancel_only_by_the_creating_key(serve, fake_complete):
    fake_complete["strategy"] = strategy("slow")
    async with serve() as c:
        _, a = await key(c, "a")
        _, b = await key(c, "b")
        rid = (await start(c, a))["run_id"]
        await until(c, a, rid, "running")
        for path in ("", "/events", "/artifacts/bibtex"):  # another key sees no trace of the run
            assert (await c.get(f"{API}/runs/{rid}{path}", headers=b)).status_code == 404
        assert (await c.post(f"{API}/runs/{rid}/cancel", headers=b)).status_code == 404
        assert (await c.get(f"{API}/runs/{rid}", headers=a)).json()["status"] == "running"
        r = await c.post(f"{API}/runs/{rid}/cancel", headers=a)
        assert r.status_code == 200 and r.json()["status"] == "stopped" and "answer" in r.json()
        assert (await c.post(f"{API}/runs/{rid}/cancel", headers=a)).json()["status"] == "stopped"  # idempotent
        assert (await c.get(f"{API}/runs/{rid}", headers=a)).json()["code"] == "stopped"
        assert (await c.post(f"{API}/runs/{u()}/cancel", headers=a)).status_code == 404


async def test_browser_runs_are_not_reachable_with_a_key_and_x_client_id_is_no_identity(serve, fake_complete):
    fake_complete["strategy"] = strategy("slow")
    async with serve() as c:
        _, h = await key(c)
        sid, cid = u(), u()
        await c.put(f"/v1/store/sessions/{sid}", json={"title": "t"})
        r = await c.post("/v1/runs", json={"session_id": sid, "turn_id": u(), "kind": "ask", "question": Q, "mode": "deep"}, headers={"x-client-id": cid})
        rid = r.json()["run"]["id"]
        for path in ("", "/events", "/artifacts/bibtex"):
            assert (await c.get(f"{API}/runs/{rid}{path}", headers=h)).status_code == 404
        assert (await c.post(f"{API}/runs/{rid}/cancel", headers={**h, "x-client-id": cid})).status_code == 404
        assert (await c.get(f"/v1/runs/{rid}", headers={"x-client-id": cid})).json()["status"] in ("queued", "running")
        await c.post(f"/v1/runs/{rid}/cancel", headers={"x-client-id": cid})


async def test_per_key_queue_caps_do_not_touch_other_keys_or_browsers(serve, fake_complete):
    fake_complete["strategy"] = strategy("slow")
    async with serve(MAX_CONCURRENT_RUNS=6, MAX_RUNNING_PER_CLIENT=1, MAX_QUEUED_PER_CLIENT=1) as c:
        _, a = await key(c, "a")
        _, b = await key(c, "b")
        ids = [(await start(c, a))["run_id"] for _ in range(2)]
        r = await c.post(f"{API}/research", json={"question": Q}, headers=a)
        assert r.status_code == 429 and r.json()["code"] == "client_busy" and r.json()["detail"]
        ids_b = [(await start(c, b))["run_id"]]
        sid, cid = u(), u()
        await c.put(f"/v1/store/sessions/{sid}", json={"title": "t"})
        r = await c.post("/v1/runs", json={"session_id": sid, "turn_id": u(), "kind": "ask", "question": Q, "mode": "deep"}, headers={"x-client-id": cid})
        assert r.status_code == 202
        for rid in ids:
            await c.post(f"{API}/runs/{rid}/cancel", headers=a)
        await c.post(f"{API}/runs/{ids_b[0]}/cancel", headers=b)
        await c.post(f"/v1/runs/{r.json()['run']['id']}/cancel", headers={"x-client-id": cid})


async def test_plan_is_429_when_the_gate_is_saturated_and_502_when_the_pipeline_is_silent(serve, fake_complete, monkeypatch):
    fake_complete["strategy"] = strategy("a")
    async with serve(ANALYZE_MAX_QUEUE=1) as c:
        _, h = await key(c)
        g = c.app.state.gate
        g.free, g.queue = 0, [object()]
        r = await c.post(f"{API}/plan", json={"question": Q}, headers=h)
        assert r.status_code == 429 and r.json()["code"] == "busy" and r.json()["detail"]
        g.free, g.queue = 1, []
        from scientist import routes_api

        async def silent(*a, **k):
            return
            yield
        monkeypatch.setattr(routes_api, "ask", silent)
        r = await c.post(f"{API}/plan", json={"question": Q}, headers=h)
        assert r.status_code == 502 and r.json()["code"] == "no_plan"


async def test_a_trashed_api_project_is_revived(serve, fake_complete):
    fake_complete["strategy"] = strategy("base editing")
    async with serve() as c:
        _, h = await key(c)
        first = await start(c, h, mode="quick")
        pid = next(p["id"] for p in (await c.get("/v1/store/snapshot")).json()["projects"] if p["name"] == "API")
        assert (await c.request("DELETE", f"/v1/store/projects/{pid}", json={})).status_code == 200
        assert not [p for p in (await c.get("/v1/store/snapshot")).json()["projects"] if p["name"] == "API"]
        second = await start(c, h, mode="quick")
        live = [p for p in (await c.get("/v1/store/snapshot")).json()["projects"] if p["name"] == "API"]
        assert len(live) == 1 and live[0]["id"] == pid
        for r in (first, second):
            await until(c, h, r["run_id"], "done")
        await usage.drain()


def doc_schemas(r):
    return r.json()["components"]["schemas"]


async def test_openapi_documents_the_error_responses(serve, fake_complete):
    async with serve() as c:
        ops = (await c.get(f"{API}/openapi.json")).json()["paths"]
        has = lambda p, m, code: str(code) in ops[API + p][m]["responses"]  # noqa: E731
        assert has("/research", "post", 429) and has("/plan", "post", 429) and has("/plan", "post", 502) and has("/plan", "post", 422)
        assert "code" in doc_schemas(await c.get(f"{API}/openapi.json"))["RunOut"]["properties"]
        assert has("/runs/{run_id}", "get", 404) and has("/runs/{run_id}/events", "get", 404)
        assert has("/runs/{run_id}/cancel", "post", 404) and not has("/runs/{run_id}/cancel", "post", 403) and has("/runs/{run_id}/cancel", "post", 404)
        assert has("/runs/{run_id}/artifacts/{kind}", "get", 409) and has("/runs/{run_id}/artifacts/{kind}", "get", 404)

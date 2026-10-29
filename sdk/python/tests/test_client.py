"""SDK tests: httpx.MockTransport fixtures shaped like the public API responses (see Task 2 report)."""
import json
import os

import httpx
import pytest

import ai_scientist_client as sdk
from ai_scientist_client import ApiError, Client

BASE = "http://api.test"
RID = "d284c6e2-0000-4000-8000-000000000001"
RUN = {"run_id": RID, "status": "done", "kind": "ask", "mode": "quick", "pack": None,
       "created_at": "2026-10-29T13:07:56.724088Z", "finished_at": "2026-10-29T13:07:56.770264Z", "error": None,
       "answer": {"content": "Comparative answer [1].",
                  "references": [{"id": "1", "paper": {"doi": "10.1000/be4", "url": "https://doi.org/10.1000/be4", "pmid": None,
                                                       "year": 2024, "title": "BE4", "source": None, "authors": ["A. Author"],
                                                       "abstract": None}, "checks": [], "status": "verified"}],
                  "records": [], "doc_refs": [], "empty_files": [],
                  "usage": {"cost_usd": None, "estimated": True, "prompt_tokens": 0, "completion_tokens": 0}},
       "progress": {"phase": "done", "searches": [{"term": "base editing", "instructions": "extract base editing"}], "replans": 0}}
QUEUED = {**RUN, "status": "queued", "finished_at": None, "answer": None, "progress": None}


def client(handler):
    return Client(BASE, "sci_key", transport=httpx.MockTransport(handler))


def test_sends_bearer_and_parses_plan_and_start():
    seen = []

    def h(req):
        seen.append(req)
        if req.url.path == "/v1/api/plan":
            return httpx.Response(200, json={"reasoning": "plan", "searches": [{"term": "t", "instructions": "i"}]})
        return httpx.Response(202, json={"run_id": RID, "session_id": "s", "turn_id": "t", "status": "queued"})

    c = client(h)
    p = c.plan("q?")
    assert p.reasoning == "plan" and p.searches[0].term == "t"
    r = c.research("q?", mode="quick", pack="bio", plan=p.searches, doc_ids=None)
    assert r.run_id == RID and r.status == "queued"
    assert all(q.headers["authorization"] == "Bearer sci_key" for q in seen)
    assert json.loads(seen[1].content) == {"question": "q?", "mode": "quick", "pack": "bio",
                                           "plan": [{"term": "t", "instructions": "i"}]}


def test_run_typed():
    run = client(lambda r: httpx.Response(200, json=RUN)).run(RID)
    assert run.done and run.answer.content.startswith("Comparative")
    assert run.answer.references[0].paper.doi == "10.1000/be4" and run.answer.usage.estimated
    assert run.progress.searches[0].term == "base editing"
    q = client(lambda r: httpx.Response(200, json=QUEUED)).run(RID)
    assert q.answer is None and not q.done


def test_packs_cancel_artifacts():
    def h(req):
        p = req.url.path
        if p.endswith("/packs"):
            return httpx.Response(200, json=[{"id": "bio", "th": "ชีวสารสนเทศ", "en": "Bioinformatics"}])
        if p.endswith("/cancel"):
            assert req.method == "POST"
            return httpx.Response(200, json={**RUN, "status": "stopped"})
        if p.endswith("/provenance"):
            return httpx.Response(200, json={"format": "ai-scientist-provenance", "version": 1})
        if p.endswith("/ris"):
            return httpx.Response(200, content=b"TY  - JOUR\r\nER  - \r\n", headers={"content-type": "application/x-research-info-systems; charset=utf-8"})
        return httpx.Response(200, content="@article{a,\n}\n".encode(), headers={"content-type": "application/x-bibtex; charset=utf-8"})

    c = client(h)
    assert c.packs()[0].en == "Bioinformatics"
    assert c.cancel(RID).status == "stopped"
    assert c.artifact(RID, "provenance")["version"] == 1
    assert c.artifact(RID, "ris") == "TY  - JOUR\r\nER  - \r\n"
    assert c.artifact(RID, "bibtex").startswith("@article")
    with pytest.raises(ValueError):
        c.artifact(RID, "pdf")


@pytest.mark.parametrize("status,body,code,msg", [
    (401, {"detail": "invalid or missing API key"}, None, "invalid or missing API key"),
    (429, {"detail": "queue busy", "code": "client_busy"}, "client_busy", "queue busy"),
    (422, {"detail": "refused: out of scope", "code": "refused"}, "refused", "refused: out of scope"),
    (422, {"detail": [{"loc": ["body", "question"], "msg": "too short"}]}, None, "too short"),
    (502, {"detail": "no plan"}, None, "no plan"),
])
def test_api_error(status, body, code, msg):
    with pytest.raises(ApiError) as e:
        client(lambda r: httpx.Response(status, json=body)).run(RID)
    assert (e.value.status, e.value.code) == (status, code) and msg in e.value.message


def test_api_error_non_json():
    with pytest.raises(ApiError) as e:
        client(lambda r: httpx.Response(503, text="bad gateway")).packs()
    assert e.value.status == 503 and "bad gateway" in e.value.message


class FakeTime:
    def __init__(self):
        self.now, self.sleeps = 0.0, []

    def monotonic(self):
        return self.now

    def sleep(self, s):
        self.sleeps.append(s)
        self.now += s


@pytest.fixture
def ft(monkeypatch):
    f = FakeTime()
    monkeypatch.setattr(sdk, "time", f)
    return f


def test_wait_backoff_until_done(ft):
    n = {"i": 0}

    def h(req):
        n["i"] += 1
        return httpx.Response(200, json=RUN if n["i"] >= 5 else QUEUED)

    r = client(h).wait(RID, interval=1, max_interval=3, timeout=100)
    assert r.status == "done" and ft.sleeps == [1, 2, 3, 3]


def test_wait_timeout_returns_last_state_without_raising(ft):
    r = client(lambda req: httpx.Response(200, json=QUEUED)).wait(RID, interval=1, max_interval=4, timeout=10)
    assert r.status == "queued" and not r.done
    assert ft.now <= 10 and len(ft.sleeps) < 20  # bounded, no hang


def test_wait_propagates_api_error(ft):
    with pytest.raises(ApiError):
        client(lambda req: httpx.Response(404, json={"detail": "not found"})).wait(RID)


SSE = (b": ping\n\nid: 1\ndata: {\"type\":\"strategy\",\"n\":1}\n\n"
       b"id: 2\r\ndata: {\"type\":\"answer\",\"content\":\"caf\xc3\xa9\"}\r\n\r\n"
       b": ping\n\nid: 3\ndata: {\"type\":\"complete\"}\n\n")


def test_events_parse_and_resume():
    seen = []

    def h(req):
        seen.append(req)
        return httpx.Response(200, content=SSE, headers={"content-type": "text/event-stream"})

    c = client(h)
    evs = list(c.events(RID))
    assert [(e.id, e.type) for e in evs] == [(1, "strategy"), (2, "answer"), (3, "complete")]
    assert evs[1].data["content"] == "café"
    assert "last-event-id" not in seen[0].headers
    list(c.events(RID, last_event_id=2))
    assert seen[1].headers["last-event-id"] == "2"


def test_events_multiline_data_and_error_status():
    body = b"id: 7\ndata: {\"type\":\ndata: \"x\"}\n\n"
    ev = list(client(lambda r: httpx.Response(200, content=body)).events(RID))
    assert ev[0].id == 7 and ev[0].type == "x"
    with pytest.raises(ApiError) as e:
        list(client(lambda r: httpx.Response(404, json={"detail": "run not found"})).events(RID))
    assert e.value.status == 404


@pytest.mark.skipif(not (os.environ.get("AI_SCIENTIST_URL") and os.environ.get("AI_SCIENTIST_KEY")),
                    reason="integration needs a live backend (Postgres-backed; the backend app cannot run in-process without a "
                           "database): set AI_SCIENTIST_URL and AI_SCIENTIST_KEY")
def test_live_backend_packs_and_auth():
    c = Client(os.environ["AI_SCIENTIST_URL"], os.environ["AI_SCIENTIST_KEY"])
    assert [p.id for p in c.packs()] == ["bio", "chem", "med", "materials", "ml", "comm"]
    with pytest.raises(ApiError) as e:
        Client(os.environ["AI_SCIENTIST_URL"], "sci_" + "x" * 43).packs()
    assert e.value.status == 401


# --- fix round 1 -----------------------------------------------------------------------------------------------------------
def test_wait_slow_poll_keeps_deadline_and_returns_last_good_state(ft):
    seen, n = [], {"i": 0}

    def h(req):
        n["i"] += 1
        if n["i"] == 1:
            return httpx.Response(200, json=QUEUED)
        seen.append(req.extensions["timeout"]["read"])
        ft.now += seen[-1]  # the poll hangs until its (capped) timeout
        raise httpx.ReadTimeout("slow", request=req)

    r = client(h).wait(RID, interval=1, timeout=10)
    assert r.status == "queued" and ft.now <= 10.2
    assert all(t <= 10 for t in seen) and min(seen) >= 0.1


def test_wait_transport_error_without_state_raises(ft):
    def h(req):
        raise httpx.ConnectError("down", request=req)

    with pytest.raises(httpx.TransportError):
        client(h).wait(RID, timeout=5)


def test_sse_id_persists_and_bad_json_is_api_error():
    ev = list(client(lambda r: httpx.Response(200, content=b"id: 4\ndata: {\"type\":\"a\"}\n\ndata: {\"type\":\"b\"}\n\n")).events(RID))
    assert [e.id for e in ev] == [4, 4]
    with pytest.raises(ApiError) as e:
        list(client(lambda r: httpx.Response(200, content=b"data: not json\n\n")).events(RID))
    assert e.value.code == "bad_event"


def test_tolerant_shapes_and_run_id_validation():
    c = client(lambda r: httpx.Response(200, json=[{"id": "bio", "th": "t", "en": "e", "new": 1}]) if r.url.path.endswith("packs")
               else httpx.Response(202, json={"run_id": RID, "session_id": "s", "turn_id": "t", "status": "queued", "extra": 1}))
    assert c.packs()[0].id == "bio" and c.research("q").run_id == RID
    for bad in ("../x", "abc", RID + "/cancel"):
        with pytest.raises(ValueError):
            c.run(bad)


def test_error_pickles_and_key_not_leaked():
    import pickle
    e = pickle.loads(pickle.dumps(ApiError(429, "client_busy", "busy")))
    assert (e.status, e.code, e.message) == (429, "client_busy", "busy") and "429" in str(e)
    c = Client(BASE, "sci_secretkey")
    assert "secretkey" not in repr(c) and "secretkey" not in str(ApiError(401, None, "invalid or missing API key"))


def test_py_typed_present():
    import pathlib
    assert (pathlib.Path(sdk.__file__).parent / "py.typed").exists()

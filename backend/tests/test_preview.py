import asyncio
import json
import threading

import httpx
import pytest

from scientist import report_render
from scientist.config import get_settings
from scientist.gate import RunGate
from scientist.main import create_app
from scientist.preview_store import PreviewStore
from scientist.routes_preview import _events
from scientist.routes_reports import ExportRequest
from test_reports import ENV, body


@pytest.fixture
def app(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)  # no stray .env
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    yield create_app()
    get_settings.cache_clear()


async def call(app, method, url, **kw):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        return await c.request(method, url, **kw)


def events(text):
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


async def test_events_in_order_then_pdf_is_fetchable(app):
    r = await call(app, "POST", "/v1/async/reports/preview", json=body(format="docx"))  # format is forced to pdf
    ev = events(r.text)
    assert [e["type"] for e in ev] == ["preview_status"] * 3 + ["preview_ready"]
    assert [e["stage"] for e in ev[:3]] == ["queued", "preparing", "rendering"]
    ready = ev[-1]
    g = await call(app, "GET", f"/v1/reports/preview/{ready['id']}")
    assert g.status_code == 200 and g.content.startswith(b"%PDF") and len(g.content) == ready["bytes"]
    assert ready["pages"] >= 1
    assert g.headers["content-type"] == "application/pdf" and g.headers["cache-control"] == "no-store"
    assert g.headers["x-content-type-options"] == "nosniff" and g.headers["content-disposition"] == "inline"
    assert app.state.preview_gate.free == 2


@pytest.mark.parametrize("key", ["0" * 32, "../../etc/passwd", "A" * 32, "abc"])
async def test_unknown_or_malformed_id_is_404(app, key):
    assert (await call(app, "GET", f"/v1/reports/preview/{key}")).status_code == 404


async def test_limit_violation_is_422_before_streaming(app):
    r = await call(app, "POST", "/v1/async/reports/preview", json=body(title="x" * 201))
    assert r.status_code == 422 and not r.headers["content-type"].startswith("text/event-stream")


async def test_queue_full_is_429(app):
    app.state.preview_gate.free = 0
    app.state.preview_gate.queue = [object()] * 10
    r = await call(app, "POST", "/v1/async/reports/preview", json=body())
    assert r.status_code == 429


async def test_disconnect_cancels_render_and_frees_slot(monkeypatch):
    started, release = threading.Event(), threading.Event()

    def slow(d):
        started.set()
        release.wait(5)
        return b"%PDF"

    monkeypatch.setattr(report_render, "render_pdf", slow)
    gate = RunGate(1)
    gen = _events(ExportRequest(**body()), gate, PreviewStore(5, 60))
    got = [(await anext(gen)).stage for _ in range(3)]
    assert got == ["queued", "preparing", "rendering"] and gate.free == 0
    await asyncio.to_thread(started.wait, 5)
    await gen.aclose()  # the client went away
    assert gate.free == 1
    release.set()


def test_store_ttl_and_lru():
    now = [0.0]
    s = PreviewStore(2, 10, max_bytes=5, clock=lambda: now[0])
    a, b = s.put(b"a"), s.put(b"b")
    assert s.get(a) == b"a"  # a is now most recently used
    c = s.put(b"c")
    assert s.get(b) is None and s.get(a) == b"a" and s.get(c) == b"c"  # b was least recently used
    assert s.put(b"123456") is None  # over the per-entry limit
    now[0] = 11
    assert s.get(a) is None and s.get(c) is None  # expired
    assert len(a) == 32

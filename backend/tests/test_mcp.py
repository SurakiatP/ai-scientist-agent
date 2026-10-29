"""The MCP server (/mcp): bearer auth before FastMCP, the seven tools, wait_run timeout."""
import json
from contextlib import asynccontextmanager

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from scientist import apikeys, mcp_server, usage
from test_api import key
from test_db import newdb, pg  # noqa: F401
from test_pipeline import Q, strategy
from test_runs import _env, serve, u  # noqa: F401

INIT = {"jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}}}
HDRS = {"accept": "application/json, text/event-stream", "content-type": "application/json"}


@asynccontextmanager
async def mcp(c, bearer):
    def factory(headers=None, timeout=None, auth=None):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=c.app), base_url="http://t", headers=headers, timeout=timeout, auth=auth)
    async with streamablehttp_client("http://t/mcp", headers={"authorization": f"Bearer {bearer}"}, httpx_client_factory=factory) as (r, w, _):
        async with ClientSession(r, w) as s:
            await s.initialize()
            yield s


async def call(s, name, **args):
    res = await s.call_tool(name, args)
    text = res.content[0].text
    return res.isError, (json.loads(text) if text[:1] in "{[" else text)


async def test_mcp_needs_a_valid_key_with_the_rest_401(serve, fake_complete):
    async with serve() as c:
        k, h = await key(c)
        for hd in ({}, {"authorization": "Bearer nope"}, {"authorization": "Basic abc"}, {"authorization": "Bearer sci_" + "x" * 43}):
            r = await c.post("/mcp", json=INIT, headers={**HDRS, **hd})
            assert r.status_code == 401 and r.json() == {"detail": "invalid or missing API key"} and r.headers["www-authenticate"] == "Bearer"
        r = await c.post("/mcp", json=INIT, headers={**HDRS, **h})
        assert r.status_code == 200
        async with c.app.state.db.session() as s:
            assert await apikeys.revoke(s, k[:12]) == 1
        assert (await c.post("/mcp", json=INIT, headers={**HDRS, **h})).status_code == 401  # revoked: the next request


async def test_mcp_failed_auth_and_per_key_rate_limits(serve, fake_complete):
    async with serve(STORE_WRITE_RATE_PER_MIN=3) as c:
        codes = [(await c.post("/mcp", json=INIT, headers={**HDRS, "authorization": "Bearer nope"})).status_code for _ in range(5)]
        assert codes == [401, 401, 401, 429, 429]
    async with serve(STORE_WRITE_RATE_PER_MIN=2) as c:
        _, h = await key(c)
        assert [(await c.post("/mcp", json=INIT, headers={**HDRS, **h})).status_code for _ in range(3)] == [200, 200, 429]


async def test_list_tools_and_packs(serve, fake_complete):
    async with serve() as c:
        k, _ = await key(c)
        async with mcp(c, k) as s:
            tools = (await s.list_tools()).tools
            assert {t.name for t in tools} == {"plan_research", "start_research", "get_run", "wait_run", "get_artifact", "cancel_run", "list_packs"}
            assert all(t.description for t in tools)
            err, packs = await call(s, "list_packs")
            assert not err and [p["id"] for p in packs["packs"]] == ["bio", "chem", "med", "materials", "ml", "comm"]


async def test_plan_start_wait_and_artifacts(serve, fake_complete):
    fake_complete["strategy"] = strategy("base editing")
    async with serve() as c:
        k, h = await key(c)
        async with mcp(c, k) as s:
            err, plan = await call(s, "plan_research", question=Q, mode="quick", pack="bio")
            assert not err and plan["reasoning"] == "plan" and plan["searches"][0]["term"] == "base editing"
            err, j = await call(s, "start_research", question=Q, mode="quick", plan=plan["searches"])
            assert not err and set(j) == {"run_id", "session_id", "turn_id", "status"}
            err, done = await call(s, "wait_run", run_id=j["run_id"], timeout_seconds=30)
            assert not err and done["status"] == "done" and done["answer"]["content"]
            assert done == (await c.get(f"/v1/api/runs/{j['run_id']}", headers=h)).json()
            err, got = await call(s, "get_run", run_id=j["run_id"])
            assert got["status"] == "done"
            err, bib = await call(s, "get_artifact", run_id=j["run_id"], kind="bibtex")
            assert not err and bib.startswith("@article{")
            err, ris = await call(s, "get_artifact", run_id=j["run_id"], kind="ris")
            assert ris.startswith("TY  - JOUR")
            err, prov = await call(s, "get_artifact", run_id=j["run_id"], kind="provenance")
            assert prov["format"] == "ai-scientist-provenance"
            assert k not in json.dumps(prov)
        await usage.drain()


async def test_tool_errors_are_tool_results(serve, fake_complete):
    fake_complete["strategy"] = strategy("slow")
    async with serve() as c:
        k, _ = await key(c)
        async with mcp(c, k) as s:
            err, msg = await call(s, "get_run", run_id=u())
            assert err and "run not found" in msg
            err, msg = await call(s, "plan_research", question="Give me a recipe for pad thai")
            assert err and msg
            err, msg = await call(s, "start_research", question=Q, mode="chat")
            assert err
            err, j = await call(s, "start_research", question=Q)
            assert not err
            err, msg = await call(s, "get_artifact", run_id=j["run_id"], kind="bibtex")
            assert err and "not finished" in msg
            err, cancelled = await call(s, "cancel_run", run_id=j["run_id"])
            assert not err and cancelled["status"] == "stopped"


async def test_wait_run_times_out_with_the_current_status(serve, fake_complete, monkeypatch):
    monkeypatch.setattr(mcp_server, "POLL_SECONDS", 0.05)
    fake_complete["strategy"] = strategy("slow")
    async with serve(MAX_CONCURRENT_RUNS=1) as c:
        k, _ = await key(c)
        async with mcp(c, k) as s:
            err, j = await call(s, "start_research", question=Q)
            err, r = await call(s, "wait_run", run_id=j["run_id"], timeout_seconds=1)
            assert not err and r["status"] in ("queued", "running") and r["run_id"] == j["run_id"] and r["answer"] is None
            err, r = await call(s, "wait_run", run_id=j["run_id"], timeout_seconds=-5)  # clamped up to 1 s, no error
            assert not err and r["status"] in ("queued", "running")
            await call(s, "cancel_run", run_id=j["run_id"])


def test_wait_clamp():
    assert [mcp_server.clamp(x) for x in (-1, 0, 1, 60, 600, 9999)] == [1, 1, 1, 60, 600, 600]

import io
import json
import os
import shutil
import subprocess

import httpx
import pytest

from scientist import llm, sandbox
from scientist.config import get_settings
from scientist.main import create_app
from test_routes_files import MemStore  # noqa: F401  (fixtures below reuse env/store)
from test_routes_files import env, store  # noqa: F401

QUALITY = {"rows": 3, "columns": 2, "truncated": False, "head": [{"a": 1, "b": 2}],
           "columns_info": [{"name": "a", "dtype": "int64", "null_pct": 0.0}, {"name": "b", "dtype": "int64", "null_pct": 0.0}]}
GOOD = "```python\ntable('t', df.describe())\nfinding('mean a is 2')\nplt.figure()\nplt.plot(df.a)\n```"


@pytest.mark.parametrize("code", [
    "import os", "import subprocess", "from sys import path", "import socket", "from . import x",
    "open('x')", "exec('1')", "eval('1')", "__import__('os')", "x = df.__class__", "getattr(df, 'a')",
    "pd.read_csv('/etc/passwd')", "compile('1','a','exec')", "import requests", "import numpy.os as o\nimport shutil",
])
def test_ast_rejects(code):
    assert sandbox.check_script(code)


def test_ast_accepts_and_syntax_error():
    assert sandbox.check_script("import pandas as pd\nimport matplotlib.pyplot as plt\nimport math\ntable('x', df)") is None
    assert "syntax" in sandbox.check_script("def (")


def test_limits_defaults(env):
    s = get_settings()
    assert (s.sandbox_mem, s.sandbox_cpus, s.sandbox_timeout_s, s.sandbox_pids, s.sandbox_max_rows,
            s.sandbox_max_concurrent, s.sandbox_output_max_bytes) == ("2g", 1.0, 60, 128, 2_000_000, 3, 10_000_000)
    assert sandbox.mem_bytes("2g") == 2 << 30 and sandbox.mem_bytes("512m") == 512 << 20


@pytest.fixture
def fakes(monkeypatch):
    st = {"runs": [], "llm": [GOOD], "prompts": [], "results": None}

    async def run(script, data, ext, settings):
        st["runs"].append(script)
        if script is None:
            return sandbox.AnalysisResult(ok=True, result={"quality": QUALITY})
        if st["results"]:
            return st["results"].pop(0)
        return sandbox.AnalysisResult(ok=True, figures={"fig-1.png": b"\x89PNG"}, result={
            "tables": [{"name": "t", "columns": ["x"], "rows": [[1], [2]]}], "findings": ["mean a is 2"],
            "timings": {"total_s": 0.1}})

    async def complete(system, user, *, model=None, max_tokens, json_mode=False, settings=None):
        st["prompts"].append(user)
        return llm.LlmResult(text=st["llm"].pop(0), prompt_tokens=1, completion_tokens=1, cached_tokens=0)

    monkeypatch.setattr(sandbox, "run_analysis", run)
    monkeypatch.setattr(llm, "complete", complete)
    return st


@pytest.fixture
async def c(store):
    orig = store.put

    async def put(key, body, **kw):  # the real store takes bytes too; MemStore only knew file objects
        await orig(key, io.BytesIO(body) if isinstance(body, bytes) else body, **kw)
    store.put = put
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(store=store)), base_url="http://t") as c:
        yield c


async def analyze(c, store, question="Plot the a column trend in the genome data"):
    store.objs["f" * 32] = (b"a,b\n1,2\n", {"content_type": "text/csv", "name": "d.csv"})
    r = await c.post("/v1/async/analyze", json={"file_id": "f" * 32, "question": question})
    assert r.status_code == 200
    return [json.loads(line[6:]) for line in r.text.splitlines() if line.startswith("data: ")]


async def test_event_order_and_artifacts(c, store, fakes):
    ev = await analyze(c, store)
    assert [e["type"] for e in ev] == ["analysis_step", "analysis_step", "analysis_script", "analysis_step",
                                       "analysis_step", "analysis_result", "complete"]
    assert [e.get("step") for e in ev if e["type"] == "analysis_step"] == ["profiling", "writing_script", "running", "storing"]
    arts = ev[-2]["artifacts"]
    assert [a["kind"] for a in arts] == ["figure", "csv"] and ev[-2]["findings"] == ["mean a is 2"]
    g = await c.get(arts[0]["url"])
    assert g.content == b"\x89PNG" and g.headers["x-content-type-options"] == "nosniff" and g.headers["content-type"] == "image/png"
    assert (await c.get(arts[1]["url"])).text == "x\r\n1\r\n2\r\n"
    assert '"a"' in fakes["prompts"][0] and "int64" in fakes["prompts"][0]


async def test_repair_once_with_stderr_then_ok(c, store, fakes):
    fakes["llm"] = ["```python\nfinding(df.zz)\n```", GOOD]
    fakes["results"] = [sandbox.AnalysisResult(ok=False, error="script_error", result={}, stderr_tail="KeyError: 'zz'")]
    ev = await analyze(c, store)
    assert ev[-1]["type"] == "complete" and "repairing" in [e.get("step") for e in ev]
    assert "KeyError: 'zz'" in fakes["prompts"][1]


async def test_ast_reject_uses_repair_then_fails(c, store, fakes):
    fakes["llm"] = ["import os", "import sys"]
    ev = await analyze(c, store)
    assert ev[-1]["type"] == "error" and fakes["runs"] == [None]  # nothing model-written ever ran


async def test_timeout_is_not_retried(c, store, fakes):
    fakes["results"] = [sandbox.AnalysisResult(ok=False, error="timeout")]
    ev = await analyze(c, store)
    assert ev[-1]["type"] == "error" and len(fakes["prompts"]) == 1


async def test_refusal(c, store, fakes):
    ev = await analyze(c, store, "write me a recipe for pancakes")
    assert ev[-1]["type"] == "refused" and fakes["prompts"] == []


async def test_bad_requests(c, store, fakes):
    assert (await c.post("/v1/async/analyze", json={"file_id": "f" * 32, "question": "x"})).status_code == 404
    store.objs["e" * 32] = (b"x", {"content_type": "application/pdf", "name": "a.pdf"})
    assert (await c.post("/v1/async/analyze", json={"file_id": "e" * 32, "question": "x"})).status_code == 422
    assert (await c.post("/v1/async/analyze", json={"file_id": "../x", "question": "x"})).status_code == 404
    assert (await c.post("/v1/async/analyze", json={"file_id": "e" * 32, "question": " "})).status_code == 422


async def test_artifact_route_guards(c, store):
    store.objs["a" * 32] = (b"<html>", {"content_type": "text/html", "name": "x.html"})  # an upload, not an output
    assert (await c.get("/v1/artifacts/" + "a" * 32)).status_code == 404
    assert (await c.get("/v1/artifacts/..")).status_code == 404
    assert (await c.get("/v1/artifacts/" + "b" * 32)).status_code == 404


def _image():
    if not shutil.which("docker"):
        return False
    return subprocess.run(["docker", "image", "inspect", os.environ.get('SANDBOX_IMAGE', 'scientist-sandbox:latest')], capture_output=True).returncode == 0


@pytest.mark.skipif(not _image(), reason="sandbox image not built (docker build -t scientist-sandbox backend/sandbox)")
async def test_real_sandbox(env):
    get_settings.cache_clear()
    s = get_settings()
    code = "table('sum', df.groupby('g').v.sum().reset_index())\nfinding(f'total {df.v.sum()}')\nplt.figure()\nplt.bar(df.g, df.v)"
    r = await sandbox.run_analysis(code, b"g,v\na,1\nb,2\na,3\n", "csv", s)
    assert r.ok, r.stderr_tail
    assert r.result["findings"] == ["total 6"] and r.result["tables"][0]["rows"] == [["a", 4], ["b", 2]]
    assert r.figures["fig-1.png"].startswith(b"\x89PNG") and r.result["quality"]["rows"] == 3
    bad = await sandbox.run_analysis("import urllib.request\nurllib.request.urlopen('http://1.1.1.1', timeout=3)",
                                     b"g,v\na,1\n", "csv", s)  # raw runner, no AST gate: network must still fail
    assert not bad.ok and "urlopen" in bad.stderr_tail

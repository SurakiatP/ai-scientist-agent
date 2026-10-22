import asyncio
import importlib.util
import json
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from scientist.config import Settings
from scientist.events import HTTP_URL, BranchAnswer, Paper
from scientist.hermes import BranchFailed, HermesRuntime, InvalidPaper, sweep_containers

ROOT = Path(__file__).resolve().parents[2]
FAKE = str(Path(__file__).parent / "fake_bridge.py")
PAPER = {"title": "Base editing", "authors": ["A. Liu"], "year": 2024, "doi": "10.1/x", "pmid": None,
         "url": "https://doi.org/10.1/x"}


@pytest.fixture
def settings():
    return Settings(openrouter_api_key="k", model="m", fallback_model="small",
                    hermes_source_path=".", hermes_revision="x", branch_token_cap=1234, branch_max_rounds=3)


def runtime(settings, tmp_path, script):
    path = tmp_path / "script.json"
    path.write_text(json.dumps({"*": script}))
    return HermesRuntime(settings, command=[sys.executable, FAKE, str(path)])


async def collect(rt, term="t"):
    return [item async for item in rt.run(term, "find methods")]


async def test_papers_then_answer(settings, tmp_path):
    rt = runtime(settings, tmp_path, [{"event": "paper", "paper": PAPER}, {"event": "answer", "content": "done"}])
    items = await collect(rt)
    assert items == [Paper(**PAPER), BranchAnswer(term="t", content="done")]


async def test_request_carries_caps_and_key_on_stdin(settings, tmp_path):
    rt = runtime(settings, tmp_path, [{"echo_request": True}])
    [answer] = await collect(rt, "crispr")
    request = json.loads(answer.content)
    assert request["term"] == "crispr" and request["instructions"] == "find methods"
    assert request["max_iterations"] == 3 and request["max_tokens"] == 1234
    assert request["model"] == "m" and request["api_key"] == "k"
    assert request["system"].strip()


async def test_bridge_death_mid_run_is_branch_failed(settings, tmp_path):
    rt = runtime(settings, tmp_path, [{"event": "paper", "paper": PAPER}, {"die": True}])
    items = await asyncio.wait_for(collect(rt), timeout=10)
    assert items[0] == Paper(**PAPER)
    assert isinstance(items[-1], BranchFailed) and items[-1].term == "t"


async def test_failed_event_and_garbage_lines(settings, tmp_path):
    rt = runtime(settings, tmp_path, [{"raw": "not json"}, {"event": "paper", "paper": {"title": 5}},
                                      {"event": "failed", "code": "native_execution_failed"}])
    items = await collect(rt)
    assert [type(i) for i in items] == [InvalidPaper, BranchFailed]
    assert items[-1] == BranchFailed(term="t", reason="native_execution_failed")


async def test_close_kills_running_bridge(settings, tmp_path):
    rt = runtime(settings, tmp_path, [{"sleep": 30}])
    task = asyncio.create_task(collect(rt))
    await asyncio.sleep(0.5)
    await rt.close()
    items = await asyncio.wait_for(task, timeout=10)
    assert isinstance(items[-1], BranchFailed)


async def test_cancel_kills_process(settings, tmp_path):
    rt = runtime(settings, tmp_path, [{"sleep": 30}])
    task = asyncio.create_task(collect(rt))
    await asyncio.sleep(0.5)
    [proc] = rt.procs
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert proc.returncode is not None and not rt.procs


async def test_paper_with_only_title_and_url_is_kept(settings, tmp_path):
    rt = runtime(settings, tmp_path, [
        {"event": "paper", "paper": {"title": "Minimal", "url": "https://x.org/1"}},
        {"event": "paper", "paper": {"title": "Nulls", "authors": None, "year": None, "doi": None, "pmid": 12345,
                                     "url": "https://x.org/2"}},
        {"event": "answer", "content": "done"}])
    items = await collect(rt)
    assert items[0] == Paper(title="Minimal", url="https://x.org/1", authors=[])
    assert items[1].authors == [] and items[1].pmid == "12345"
    assert isinstance(items[2], BranchAnswer)


async def test_invalid_paper_is_reported_not_dropped(settings, tmp_path):
    rt = runtime(settings, tmp_path, [{"event": "paper", "paper": {"title": "Bad", "url": "javascript:alert(1)"}},
                                      {"event": "paper"}, {"event": "answer", "content": "done"}])
    items = await collect(rt)
    assert [type(i) for i in items] == [InvalidPaper, InvalidPaper, BranchAnswer]
    assert items[0].term == "t" and items[0].reason


@pytest.mark.parametrize("url", ["javascript:alert(1)", "data:text/html,x", " JavaScript:alert(1)", "ftp://x.org/a",
                                 "http://", "https://x.org/a b", "java\tscript:alert(1)", "//evil.com", "http://@/x",
                                 "https://@evil.com"])
def test_paper_url_must_be_http(url):
    with pytest.raises(ValidationError):
        Paper(title="t", url=url)


def test_paper_url_http_and_https_ok():
    assert Paper(title="t", url="https://user@x.org/a").url == "https://user@x.org/a"
    assert Paper(title="t", url=" HTTPS://doi.org/10.1/x ").url == "HTTPS://doi.org/10.1/x"
    assert Paper(title="t", url="http://x.org").url == "http://x.org"


def load_bridge():
    spec = importlib.util.spec_from_file_location("native_bridge", ROOT / "infra/hermes/native_bridge.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # importing must not touch sys.stdout or Hermes
    return module


def test_bridge_clean_paper():
    clean = load_bridge().clean_paper
    assert clean({"title": "T", "url": "https://x.org", "authors": None, "pmid": None}) == (
        {"title": "T", "url": "https://x.org"}, None)
    assert clean({"title": "T", "url": "https://x.org", "pmid": 42})[0]["pmid"] == "42"
    for bad in ({"url": "https://x.org"}, {"title": "T", "url": "javascript:x"}, {"title": "T"},
                {"title": "T", "url": "https://x.org", "authors": "A. Liu"},
                {"title": "T", "url": "https://x.org", "year": "2024"}):
        paper, error = clean(bad)
        assert paper is None and error


def test_bridge_and_backend_url_rules_match():
    bridge = load_bridge().HTTP_URL
    assert (bridge.pattern, bridge.flags) == (HTTP_URL.pattern, HTTP_URL.flags)


async def test_rejected_event_becomes_invalid_paper_with_key(settings, tmp_path):
    rt = runtime(settings, tmp_path, [
        {"event": "rejected", "paper": {"title": "T", "doi": "HTTPS://doi.org/10.1/ABC", "url": "javascript:x"},
         "reason": "url must be an http(s) link"},
        {"event": "rejected", "reason": "arguments must be an object"},
        {"event": "answer", "content": "done"}])
    items = await collect(rt)
    assert items[0] == InvalidPaper(term="t", key="doi:10.1/abc", reason="url must be an http(s) link")
    assert items[1].key is None and items[1].reason
    assert isinstance(items[2], BranchAnswer)


def test_sweep_removes_only_labelled_containers(tmp_path, monkeypatch):
    log = tmp_path / "docker.log"
    docker = tmp_path / "docker"
    docker.write_text(f'#!/bin/sh\necho "$@" >> {log}\n[ "$1" = ps ] && printf "c1\\nc2\\n"\nexit 0\n')
    docker.chmod(0o755)
    monkeypatch.setenv("PATH", str(tmp_path))
    sweep_containers()
    assert log.read_text().splitlines() == ["ps -aq --filter label=scientist.branch=1", "rm -f c1 c2"]


def test_sweep_without_docker_is_a_no_op(tmp_path, monkeypatch):
    monkeypatch.setenv("PATH", str(tmp_path))
    sweep_containers()

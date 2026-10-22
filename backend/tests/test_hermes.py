import asyncio
import json
import sys
from pathlib import Path

import pytest

from scientist.config import Settings
from scientist.events import BranchAnswer, Paper
from scientist.hermes import BranchFailed, HermesRuntime

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
    assert items == [BranchFailed(term="t", reason="native_execution_failed")]


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

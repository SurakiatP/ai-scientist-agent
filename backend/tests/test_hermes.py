import asyncio
import importlib.util
import json
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from scientist.config import Settings
from scientist.events import HTTP_URL, BranchAnswer, Paper
from scientist.events import DataRecord
from scientist.hermes import BranchFailed, HermesRuntime, InvalidPaper, InvalidRecord, sweep_containers

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


async def collect(rt, term="t", usage=False):
    from scientist.hermes import BranchUsage
    return [item async for item in rt.run(term, "find methods") if usage or not isinstance(item, BranchUsage)]


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
        {"event": "rejected", "paper": {"title": "T", "doi": "HTTPS://doi.org/10.1000/ABC", "url": "javascript:x"},
         "reason": "url must be an http(s) link"},
        {"event": "rejected", "reason": "arguments must be an object"},
        {"event": "answer", "content": "done"}])
    items = await collect(rt)
    assert items[0] == InvalidPaper(term="t", key="doi:10.1000/abc", reason="url must be an http(s) link")
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


def test_prepare_writes_only_to_runtime_dir(settings, tmp_path, monkeypatch):
    import scientist.hermes as h
    cache = tmp_path / "ro"
    (cache / "upstream/scientific-agent-skills/skills").mkdir(parents=True)
    monkeypatch.setattr(h, "CACHE", cache)
    monkeypatch.setattr(h, "SKILLS_SOURCE", cache / "upstream/scientific-agent-skills")
    monkeypatch.setattr(h, "_check_pinned", lambda *a: None)
    s = settings.model_copy(update={"hermes_runtime_dir": tmp_path / "rw/hermes-home", "enabled_skills": []})
    env = HermesRuntime(s)._prepare()
    assert (tmp_path / "rw/hermes-home/config.yaml").is_file() and not (cache / "hermes-home").exists()
    assert env["HERMES_HOME"] == str(tmp_path / "rw/hermes-home")


async def test_stop_cancelled_twice_still_untracks_the_process(settings, tmp_path):
    rt = runtime(settings, tmp_path, {})
    proc = await asyncio.create_subprocess_exec(sys.executable, "-c", "import signal, time; signal.signal(signal.SIGTERM, signal.SIG_IGN); print('ready', flush=True); time.sleep(30)", stdout=asyncio.subprocess.PIPE)
    await proc.stdout.readline()  # SIGTERM is ignored from here on, so the graceful wait really waits
    rt.procs.add(proc)
    stop = asyncio.create_task(rt._stop(proc))
    await asyncio.sleep(0.2)  # inside the graceful wait
    stop.cancel()
    with pytest.raises(asyncio.CancelledError):
        await stop
    assert proc not in rt.procs
    proc.kill()
    await proc.wait()


RECORD = {"database": "uniprot", "id": "P04637", "title": "p53", "url": "https://www.uniprot.org/uniprotkb/P04637"}


async def test_record_events_become_items(settings, tmp_path):
    rt = runtime(settings, tmp_path, [
        {"event": "paper", "paper": {**PAPER, "source": "Europe PMC"}},
        {"event": "record", "record": RECORD},
        {"event": "record", "record": {**RECORD, "id": "Q1", "url": "https://uniprot.org.evil.com/Q1"}},
        {"event": "record_rejected", "record": {"database": "uniprot", "id": "Q2"}, "reason": "no"},
        {"event": "answer", "content": "done"}])
    items = await collect(rt)
    assert items[0].source == "europepmc"
    assert items[1] == DataRecord(**RECORD)
    assert isinstance(items[2], InvalidRecord) and items[2].key == "uniprot:Q1" and "official host" in items[2].reason
    assert items[3] == InvalidRecord(term="t", key="uniprot:Q2", reason="no")


UNIPROT = {"uniprot": {"name": "UniProt", "hosts": ["uniprot.org"]}}


async def test_request_lists_keyless_databases_only(settings, tmp_path):
    settings.enabled_skills = ["paper-lookup", "database-lookup"]
    rt = runtime(settings, tmp_path, [{"echo_request": True}])
    [answer] = await collect(rt)
    req = json.loads(answer.content)
    sources = req["data_sources"]
    assert sources["uniprot"] == {"name": "UniProt", "hosts": ["uniprot.org"]} and "omim" not in sources
    assert req["key_gated_sources"]["omim"] == "OMIM" and "uniprot" not in req["key_gated_sources"]
    assert "database-lookup" in req["system"] and "report_record" in req["system"]


async def test_without_the_database_skill_no_data_sources_and_no_database_prompt(settings, tmp_path):
    settings.enabled_skills = ["paper-lookup"]
    [answer] = await collect(runtime(settings, tmp_path, [{"echo_request": True}]))
    req = json.loads(answer.content)
    assert req["data_sources"] == {} and req["key_gated_sources"] == {}
    assert "database-lookup" not in req["system"] and "report_record" not in req["system"] and "{{" not in req["system"]
    assert "paper-lookup" in req["system"] and "skills_list" in req["system"]  # told not to start with it


async def test_corrected_retry_with_display_name_has_the_same_key_as_the_accepted_record(settings, tmp_path):
    rt = runtime(settings, tmp_path, [
        {"event": "record_rejected", "record": {"database": "UniProt", "id": "P1", "url": "http://x"}, "reason": "bad url"},
        {"event": "record", "record": {**RECORD, "id": "P1", "database": "uniprot"}}, {"event": "answer", "content": "d"}])
    items = await collect(rt)
    assert items[0].key == "uniprot:P1" and (items[1].database, items[1].id) == ("uniprot", "P1")


async def test_needs_key_rejection_carries_a_code(settings, tmp_path):
    rt = runtime(settings, tmp_path, [
        {"event": "record_rejected", "record": {"database": "OMIM", "id": "1"}, "reason": "needs a key", "code": "needs_key"},
        {"event": "record_rejected", "record": {"database": "uniprot", "id": "2"}, "reason": "no"},
        {"event": "answer", "content": "d"}])
    items = await collect(rt)
    assert (items[0].key, items[0].code, items[1].code) == ("omim:1", "needs_key", None)


def test_bridge_clean_record():
    clean = load_bridge().clean_record
    hosts = UNIPROT
    assert clean(RECORD, hosts) == (RECORD, None)
    for name in ("UniProt", " uniprot ", "ChEMBL"[:0] + "UNIPROT"):
        assert clean({**RECORD, "database": name}, hosts) == (RECORD, None)
    assert clean({**RECORD, "id": 7}, hosts)[0]["id"] == "7"
    for bad in ({**RECORD, "database": "omim"}, {**RECORD, "url": "https://uniprot.org.evil.com/x"},
                {**RECORD, "url": "http://uniprot.org/x"}, {**RECORD, "url": "https://uniprot.org@evil.com/"},
                {**RECORD, "title": ""}, {**RECORD, "title": "x" * 301}, {**RECORD, "summary": "x" * 601}):
        record, error = clean(bad, hosts)
        assert record is None and error
    assert clean("x", hosts)[0] is None


def test_bridge_key_gated_database_is_refused_with_its_own_reason():
    bridge = load_bridge()
    gated = {"omim": "OMIM", "drugbank": "DrugBank"}
    for name in ("omim", "OMIM", " DrugBank "):
        record, error = bridge.clean_record({**RECORD, "database": name}, UNIPROT, gated)
        assert record is None and "needs an API key that is not configured here" in error and bridge.NEEDS_KEY in error
    assert "not available" in bridge.clean_record({**RECORD, "database": "nope"}, UNIPROT, gated)[1]
    assert bridge.clean_record(RECORD, UNIPROT, gated) == (RECORD, None)


def test_bridge_keeps_paper_source():
    assert load_bridge().clean_paper({"title": "T", "url": "https://x.org", "source": " PubMed Central "})[0]["source"] == "PubMed Central"
    assert load_bridge().ALLOWED >= {"report_record"}


def test_bridge_and_backend_agree_on_record_urls():
    from test_sources import URL_CASES

    from scientist.sources import PAPER_SOURCES
    bridge = load_bridge()
    assert bridge.PAPER_SOURCES == tuple(PAPER_SOURCES)
    from test_sources import DB_NAME_CASES

    from scientist.sources import DATA_SOURCES, normalize_database
    every = {k: {"name": d.name, "hosts": list(d.hosts)} for k, d in DATA_SOURCES.items()}
    for name, db in DB_NAME_CASES:
        assert normalize_database(name) == db
        got = bridge.clean_record({**RECORD, "database": name, "url": f"https://{DATA_SOURCES[db].hosts[0]}/x"}, every)[0] if db else None
        assert (got["database"] if got else None) == db, name
    for url, ok in URL_CASES:
        record, _ = bridge.clean_record({**RECORD, "url": url}, UNIPROT)
        assert (record is not None) is ok, url


def boot_bridge(monkeypatch, request):
    import types

    bridge = load_bridge()
    wire, handlers = [], {}
    monkeypatch.setattr(bridge, "emit", wire.append)
    registry = types.SimpleNamespace(register=lambda name, handler, **_: handlers.__setitem__(name, handler),
                                     dispatch=lambda *a, **k: "")
    monkeypatch.setitem(sys.modules, "tools", types.ModuleType("tools"))
    for name, attrs in {"tools.terminal_tool": {}, "tools.registry": {"registry": registry},
                        "tools.terminal_tool_lifecycle": {"cleanup_vm": lambda *a, **k: None},
                        "run_agent": {"AIAgent": lambda **k: (_ for _ in ()).throw(RuntimeError)}}.items():
        mod = types.ModuleType(name)
        mod.__dict__.update(attrs)
        monkeypatch.setitem(sys.modules, name, mod)
    monkeypatch.setattr(sys, "stdin", __import__("io").StringIO(json.dumps(request) + "\n"))
    monkeypatch.setattr(bridge.signal, "signal", lambda *a: None)
    monkeypatch.setattr(bridge, "WIRE", sys.stdout)
    saved = sys.stdout
    try:
        bridge.main()
    finally:
        sys.stdout = saved
    return wire, handlers


def test_bridge_registers_report_record_only_with_data_sources(monkeypatch):
    _, handlers = boot_bridge(monkeypatch, {"data_sources": {}})
    assert "report_paper" in handlers and "report_record" not in handlers


def test_bridge_key_gated_rejection_event_has_the_code(monkeypatch):
    wire, handlers = boot_bridge(monkeypatch, {"data_sources": UNIPROT, "key_gated_sources": {"omim": "OMIM"}})
    out = json.loads(handlers["report_record"]({**RECORD, "database": "OMIM", "id": "1"}))
    assert "API key" in out["error"] and wire[-1]["code"] == "needs_key" and wire[-1]["record"]["database"] == "OMIM"
    handlers["report_record"]({**RECORD, "url": "http://uniprot.org/x"})
    assert "code" not in wire[-1]


def test_bridge_report_record_handler_payloads(monkeypatch):
    wire, handlers = boot_bridge(monkeypatch, {"data_sources": UNIPROT})
    out = json.loads(handlers["report_record"]({"database": "uniprot", "id": "9" * 900, "url": "http://uniprot.org/x"}))
    assert "record not recorded" in out["error"]
    event = wire[-1]
    assert event["event"] == "record_rejected" and event["reason"]
    assert event["record"] == {"database": "uniprot", "id": "9" * 500, "url": "http://uniprot.org/x"}
    handlers["report_record"](RECORD)
    assert wire[-1] == {"event": "record", "record": RECORD}


def test_bridge_schemas_list_allowed_ids():
    bridge = load_bridge()
    from scientist.sources import PAPER_SOURCES
    assert bridge.PAPER_SCHEMA["parameters"]["properties"]["source"]["enum"] == list(PAPER_SOURCES)
    props = bridge.record_schema(UNIPROT)["parameters"]["properties"]["database"]
    assert props["enum"] == ["uniprot"] and "UniProt" in props["description"]


def usage_line(**k):
    return {"event": "usage", "prompt_tokens": 100, "completion_tokens": 20, "cost_usd": 0.01, "cost_status": "actual", "api_calls": 2, **k}


async def test_usage_after_answer_and_after_failed(settings, tmp_path):
    from scientist.hermes import BranchUsage
    for end in ({"event": "answer", "content": "done"}, {"event": "failed", "code": "native_execution_failed"}):
        items = await collect(runtime(settings, tmp_path, [end, usage_line()]), usage=True)
        assert isinstance(items[-1], BranchUsage) and items[-1] == BranchUsage(term="t", prompt_tokens=100, completion_tokens=20,
                                                                                cost_usd=0.01, cost_status="actual")
        assert len(items) == 2


async def test_missing_usage_line_is_reported_as_unknown_cost(settings, tmp_path):
    from scientist.hermes import BranchUsage
    items = await collect(runtime(settings, tmp_path, [{"event": "answer", "content": "done"}]), usage=True)
    assert items[-1] == BranchUsage(term="t", prompt_tokens=0, completion_tokens=0, cost_usd=None, cost_status="unknown")
    items = await asyncio.wait_for(collect(runtime(settings, tmp_path, [{"die": True}]), usage=True), 10)
    assert isinstance(items[0], BranchFailed) and items[-1].cost_usd is None


async def test_usage_counters_are_sanitized(settings, tmp_path):
    items = await collect(runtime(settings, tmp_path, [{"event": "answer", "content": "d"},
                                                       usage_line(prompt_tokens=-5, completion_tokens="x", cost_usd=-1.0)]), usage=True)
    assert (items[-1].prompt_tokens, items[-1].completion_tokens, items[-1].cost_usd) == (0, 0, None)


def test_bridge_usage_event_reads_counters_defensively():
    ev = load_bridge().usage_event
    class A:
        session_prompt_tokens, session_completion_tokens, session_api_calls = 10, 5, 3
        session_estimated_cost_usd, session_cost_status = 0.02, "estimated"
    assert ev(A()) == {"event": "usage", "prompt_tokens": 10, "completion_tokens": 5, "cost_usd": 0.02,
                       "cost_status": "estimated", "api_calls": 3}
    zero = {"event": "usage", "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": None, "cost_status": "unknown", "api_calls": 0}
    assert ev(object()) == zero and ev(None) == zero
    class B(A):
        session_cost_status = "unknown"
    assert ev(B())["cost_usd"] is None  # no price known: never invent a number


async def test_cancelled_branch_still_reports_its_spend(settings, tmp_path):
    from scientist import usage
    acc = usage.Acc()
    usage.CURRENT.set(acc)
    rt = runtime(settings, tmp_path, [{"on_term": usage_line(prompt_tokens=77, completion_tokens=8, cost_usd=0.5)}, {"sleep": 30}])
    task = asyncio.create_task(collect(rt))
    await asyncio.sleep(1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert (acc.prompt, acc.completion, acc.cost) == (77, 8, 0.5)


async def test_usage_before_answer_still_fails_the_branch_and_counts_once(settings, tmp_path):
    items = await collect(runtime(settings, tmp_path, [usage_line()]), usage=True)
    assert [type(i).__name__ for i in items] == ["BranchUsage", "BranchFailed"]


async def test_unknown_status_nulls_the_cost(settings, tmp_path):
    items = await collect(runtime(settings, tmp_path, [{"event": "answer", "content": "d"}, usage_line(cost_usd=0.0, cost_status="unknown")]), usage=True)
    assert items[-1].cost_usd is None

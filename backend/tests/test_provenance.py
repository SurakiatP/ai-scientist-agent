import json

import httpx

from scientist import llm, pipeline, usage
from scientist.config import Settings
from scientist.events import FinalAnswer, Provenance
from scientist.hermes import SANDBOX_IMAGE, SKILLS_REVISION
from scientist.provenance import digest
from scientist.runs import _outcome
from test_pipeline import Plan, Q, Turn, answer, apaper, review_reply, crossref, paper, replan_reply, runner, settings, start, strategy  # noqa: F401


SECRET_FIELDS = ("openrouter_api_key", "minio_access_key", "minio_secret_key", "minio_access_key_file", "minio_secret_key_file",
                 "database_url", "database_password_file", "minio_endpoint", "minio_public_endpoint", "contact_email")
SECRETS = {f: f"SENTINEL-{f}-9z" for f in SECRET_FIELDS}


def seed_secrets(settings):
    for f, v in SECRETS.items():
        setattr(settings, f, v)


def test_empty_app_version_is_null():
    s = Settings(openrouter_api_key="k", model="m", fallback_model="f", hermes_source_path=".", hermes_revision="x", app_version="")
    assert s.app_version is None


async def final(question, rt, settings, **kw):
    from scientist.pipeline import ask
    from scientist.gate import RunGate
    events = usage.track(ask(question, rt, settings=settings, client=crossref(), gate=RunGate(4), **kw), mode="deep", db=None)
    out = [e async for e in events if isinstance(e, FinalAnswer)][-1]  # db=None: the usage row fails quietly
    await usage.drain()
    return out


async def test_replanned_run_lists_rounds_in_order(settings, tmp_path, fake_complete):
    seed_secrets(settings)
    settings.app_version = "v9"
    fake_complete["strategy"] = strategy("rich", "thin")
    fake_complete["replan"] = replan_reply("wider")
    rt = runner(settings, tmp_path, {"rich": [paper("R1", "10.1/r1"), paper("R2", "10.1/r2"), answer("rich")],
                                     "thin": [paper("T1", "10.1/t1"), answer("thin")], "wider": [answer("x")]})
    fa = await final(Q, rt, settings)
    p = fa.provenance
    assert [(r.round, [s.term for s in r.searches], r.thin) for r in p.rounds] == [(1, ["rich", "thin"], None), (2, ["wider"], ["thin"])]
    assert p.rounds[1].searches[0].instructions == "extract wider"
    assert p.app_version == "v9" and p.models.main == "m" and p.models.fallback == "small"
    assert p.hermes.revision == "x" and p.hermes.skills_revision == SKILLS_REVISION and p.hermes.branch_image == SANDBOX_IMAGE
    assert p.settings.replan_rounds == 1 and p.settings.review_enabled is True
    assert (p.settings.strategy_max_tokens, p.settings.synthesis_max_tokens, p.settings.review_max_tokens) == (
        settings.strategy_max_tokens, settings.synthesis_max_tokens, settings.review_max_tokens)
    assert p.plan_source == "strategy" and p.history_turns == 0 and p.input_sha256 is None
    assert set(p.prompts) == {"strategy", "replan", "branch", "synthesis"}  # no abstracts: no review call
    assert p.prompts["branch"] == digest(rt.system) and p.prompts["synthesis"] == digest(pipeline.SYNTHESIS)
    assert p.phase_seconds.get("synthesis", 0) >= 0 and "synthesis" in p.phase_seconds
    d = json.loads(fa.model_dump_json())["provenance"]
    assert d["schema"] == 1 and "schema_" not in d and Provenance.model_validate(d)
    assert not [v for v in SECRETS.values() if v in json.dumps(d)] and Q not in json.dumps(d)  # no secret, no question


async def test_given_plan_has_no_strategy_hash_or_replan(settings, tmp_path, fake_complete):
    rt = runner(settings, tmp_path, {"*": [paper("P", "10.1/p"), paper("Q", "10.1/q"), answer("ok")]})
    p = (await final(Q, rt, settings, plan=[Plan("a"), Plan("b")])).provenance
    assert [(r.round, [s.term for s in r.searches]) for r in p.rounds] == [(1, ["a", "b"])]
    assert "strategy" not in p.prompts and "replan" not in p.prompts and p.app_version is None
    assert p.plan_source == "given"


async def test_history_turns_counts_earlier_turns(settings, tmp_path, fake_complete):
    fake_complete["strategy"] = strategy("a")
    rt = runner(settings, tmp_path, {"*": [paper("P", "10.1/p"), answer("ok")]})
    assert (await final(Q, rt, settings, history=[Turn("q1", "a1"), Turn("q2", "a2")])).provenance.history_turns == 2


async def test_prompt_hash_follows_the_text(settings, tmp_path, fake_complete, monkeypatch):
    fake_complete["strategy"] = strategy("a")
    rt = runner(settings, tmp_path, {"*": [paper("P", "10.1/p"), answer("ok")]})
    a = (await final(Q, rt, settings)).provenance.prompts
    b = (await final(Q, rt, settings)).provenance.prompts
    assert a == b  # stable
    monkeypatch.setattr(pipeline, "SYNTHESIS", pipeline.SYNTHESIS + "!")
    rt.system += "?"  # the branch prompt as built, database part included
    c = (await final(Q, rt, settings)).provenance.prompts
    assert c["synthesis"] != a["synthesis"] and c["branch"] != a["branch"] and c["strategy"] == a["strategy"]


async def test_review_off_and_no_summary_drop_those_prompts(settings, tmp_path, fake_complete):
    settings.review_enabled = False
    fake_complete["strategy"] = strategy("a")
    rt = runner(settings, tmp_path, {"*": [paper("P", "10.1/p"), answer("ok")]})
    assert "review" not in (await final(Q, rt, settings)).provenance.prompts
    rt = runner(settings, tmp_path, {"*": [paper("P", "10.1/p")]})  # papers, no summary: no synthesis call
    assert "synthesis" not in (await final(Q, rt, settings)).provenance.prompts


async def test_failed_run_has_no_final_answer(settings, tmp_path, fake_complete):
    fake_complete["strategy"] = strategy("a")
    rt = runner(settings, tmp_path, {"*": [answer("no papers")]})
    assert not [e async for e in start(Q, rt, settings) if isinstance(e, FinalAnswer)]


def test_phase_seconds_outside_a_run_is_empty():
    assert usage.phase_seconds("synthesis") == {}


def test_outcome_carries_provenance_old_turn_has_none():
    prov = {"schema": 1, "created_at": "t", "models": {}, "prompts": {}, "phase_seconds": {}}
    ev = {"type": "final_answer", "content": "c", "references": []}
    assert _outcome(None, {**ev, "provenance": prov})["answer"]["provenance"] == prov
    assert "provenance" not in _outcome(None, ev)["answer"]
    assert "provenance" not in _outcome(None, {**ev, "provenance": None})["answer"]


def test_analysis_result_provenance_reaches_the_turn():
    from scientist.runs import reduce_analysis
    a = reduce_analysis({"steps": []}, {"type": "analysis_result", "quality": {}, "tables": [], "findings": [], "timings": {},
                                         "artifacts": [], "provenance": {"schema": 1}})
    assert a["provenance"] == {"schema": 1}
    assert "provenance" not in reduce_analysis({"steps": []}, {"type": "analysis_result", "quality": {}, "tables": [],
                                                              "findings": [], "timings": {}, "artifacts": []})


async def test_quick_mode_rounds_are_the_truncated_plan(settings, tmp_path, fake_complete):
    fake_complete["strategy"] = strategy("a", "b", "c")
    rt = runner(settings, tmp_path, {"*": [paper("P", "10.1/p"), answer("ok")]})
    p = (await final(Q, rt, settings, mode="quick")).provenance
    assert [[s.term for s in r.searches] for r in p.rounds] == [["a", "b"]] and "replan" not in p.prompts


async def test_edited_plan_then_replan(settings, tmp_path, fake_complete):
    fake_complete["replan"] = replan_reply("wider")
    rt = runner(settings, tmp_path, {"a": [answer("s")], "b": [paper("B1", "10.1/b1"), paper("B2", "10.1/b2"), answer("s")],
                                     "wider": [paper("W", "10.1/w"), answer("s")]})
    p = (await final(Q, rt, settings, plan=[Plan("a"), Plan("b")])).provenance
    assert [(r.round, [s.term for s in r.searches], r.thin) for r in p.rounds] == [(1, ["a", "b"], None), (2, ["wider"], ["a"])]
    assert "strategy" not in p.prompts and "replan" in p.prompts


async def test_failed_replan_call_keeps_round_one_and_hashes_replan(settings, tmp_path, fake_complete):
    fake_complete["strategy"] = strategy("a", "b")
    fake_complete["replan"] = RuntimeError("down")
    rt = runner(settings, tmp_path, {"a": [answer("s")], "b": [paper("B1", "10.1/b1"), paper("B2", "10.1/b2"), answer("s")]})
    p = (await final(Q, rt, settings)).provenance
    assert [r.round for r in p.rounds] == [1] and "replan" in p.prompts


async def test_review_hashed_only_when_a_call_was_sent(settings, tmp_path, fake_complete):
    fake_complete["strategy"] = strategy("a")
    fake_complete["synthesis"] = "No citations here."  # nothing to review: no review call
    rt = runner(settings, tmp_path, {"*": [paper("P", "10.1/p"), answer("ok")]})
    p = (await final(Q, rt, settings)).provenance
    assert "review" not in p.prompts and not any(c["system"] == pipeline.REVIEW for c in fake_complete["calls"])


async def test_failed_review_call_still_hashes_review(settings, tmp_path, fake_complete):
    fake_complete["strategy"] = strategy("a")
    fake_complete["synthesis"] = "Editors are efficient [1]."
    fake_complete["review"] = RuntimeError("down")
    rt = runner(settings, tmp_path, {"a": [apaper("P", "10.1/p"), answer("ok")]})
    p = (await final(Q, rt, settings)).provenance
    assert "review" in p.prompts and any(c["system"] == pipeline.REVIEW for c in fake_complete["calls"])

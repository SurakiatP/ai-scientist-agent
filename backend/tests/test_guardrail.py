import json
import os
from pathlib import Path

import pytest

from scientist import guardrail
from scientist.config import Settings
from scientist.guardrail import check_scope

CASES = json.loads((Path(__file__).parent / "data/scope_cases.json").read_text())


@pytest.fixture
def settings():
    return Settings(openrouter_api_key="k", model="m", fallback_model="small",
                    hermes_source_path=".", hermes_revision="x")


def make_ask(reply):
    calls = []

    async def ask(system, user):
        calls.append(user)
        if isinstance(reply, Exception):
            raise reply
        return reply

    ask.calls = calls
    return ask


def test_case_file_size():
    th = [c for c in CASES if any("฀" <= ch <= "๿" for ch in c["q"])]
    assert len(th) >= 10 and len(CASES) - len(th) >= 10


@pytest.mark.parametrize("case", CASES, ids=[c["q"][:40] for c in CASES])
async def test_cases(case, settings):
    # model (if reached) always rejects, so in-scope cases must be decided by rules
    v = await check_scope(case["q"], settings=settings, ask=make_ask('{"in_scope": false, "reason": "no"}'))
    assert v.in_scope is case["in_scope"]


@pytest.mark.parametrize("q", ["", "   \n"])
async def test_empty_question_out_of_scope(q, settings):
    ask = make_ask("{}")
    assert not (await check_scope(q, settings=settings, ask=ask)).in_scope
    assert ask.calls == []


async def test_overlong_question_out_of_scope(settings):
    ask = make_ask("{}")
    v = await check_scope("protein " * 1000, settings=settings, ask=ask)
    assert not v.in_scope and ask.calls == []


async def test_rule_decided_makes_no_model_call(settings):
    ask = make_ask("{}")
    await check_scope("CRISPR off-target effects", settings=settings, ask=ask)
    await check_scope("write my homework essay", settings=settings, ask=ask)
    assert ask.calls == []


async def test_inconclusive_uses_model(settings):
    ask = make_ask('{"in_scope": true, "reason": "ok"}')
    v = await check_scope("How do tardigrades survive?", settings=settings, ask=ask)
    assert v.in_scope and len(ask.calls) == 1


@pytest.mark.parametrize("reply", ["not json", '{"reason": "x"}', "[]", RuntimeError("down")])
async def test_model_failure_fails_closed(reply, settings):
    v = await check_scope("How do tardigrades survive?", settings=settings, ask=make_ask(reply))
    assert not v.in_scope and "could not be completed" in v.reason


NEG = [c["q"] for c in CASES if not c["in_scope"]]


@pytest.mark.parametrize("q", NEG)
async def test_negatives_not_accepted_by_rules_alone(q, settings):
    # a model that always errors must never turn an off-topic question into in_scope
    v = await check_scope(q, settings=settings, ask=make_ask(RuntimeError("down")))
    assert not v.in_scope


@pytest.mark.parametrize("q", ["How does DNA methylation work?", "What does the cell membrane do?",
                               "What is a good general name for my cat?", "Help me write my internal email"])
async def test_weak_single_word_hits_reach_model(q, settings):
    ask = make_ask('{"in_scope": true, "reason": "ok"}')
    v = await check_scope(q, settings=settings, ask=ask)
    assert len(ask.calls) == 1 and v.in_scope  # rules did not decide; model answer is respected


@pytest.mark.parametrize("q", ["ช่วยเขียนเรียงความเรื่องวัคซีนให้หน่อย", "ดูดวงวันนี้ด้วยการเรียนรู้ของเครื่อง"])
async def test_science_word_in_offtopic_request_goes_to_model(q, settings):
    ask = make_ask('{"in_scope": false, "reason": "no"}')
    assert not (await check_scope(q, settings=settings, ask=ask)).in_scope
    assert len(ask.calls) == 1


AMBIGUOUS = ["How do cells react to hypoxia?", "How do metals react with acid?",
             "How do plants react to drought?", "Fish stocks in the Gulf of Thailand",
             "Does CSS in fMRI studies matter", "Effect of election stress on cortisol",
             "ดวงอาทิตย์ปล่อยรังสีอย่างไร", "ดวงดาวเกิดขึ้นได้อย่างไร", "ผลกระทบของหุ้นส่วนต่อการวิจัย"]


@pytest.mark.parametrize("q", AMBIGUOUS)
async def test_ambiguous_words_not_refused_by_rules(q, settings):
    ask = make_ask('{"in_scope": true, "reason": "ok"}')
    v = await check_scope(q, settings=settings, ask=ask)
    assert v.in_scope and len(ask.calls) == 1


@pytest.mark.skipif(os.getenv("LIVE") != "1", reason="set LIVE=1 to hit the real model")
async def test_live_model():
    v = await check_scope("How do tardigrades survive desiccation?", settings=guardrail.get_settings())
    assert v.in_scope
    v = await check_scope("What is a good name for my cat?", settings=guardrail.get_settings())
    assert not v.in_scope

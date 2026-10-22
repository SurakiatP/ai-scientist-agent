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


@pytest.mark.skipif(os.getenv("LIVE") != "1", reason="set LIVE=1 to hit the real model")
async def test_live_model():
    v = await check_scope("How do tardigrades survive desiccation?", settings=guardrail.get_settings())
    assert v.in_scope
    v = await check_scope("What is a good name for my cat?", settings=guardrail.get_settings())
    assert not v.in_scope

import pytest

from scientist import llm


@pytest.fixture
def fake_complete(monkeypatch):
    """Recording fake for llm.complete: JSON-mode calls get the strategy (or the re-plan), the rest the synthesis."""
    state = {"strategy": None, "replan": None, "synthesis": "Comparative answer [1].", "calls": []}

    async def complete(system, user, *, model=None, max_tokens, json_mode=False, settings=None):
        state["calls"].append({"system": system, "user": user, "json_mode": json_mode, "max_tokens": max_tokens})
        reply = state["synthesis"] if not json_mode else state["replan" if system.startswith("You re-plan") else "strategy"]
        if isinstance(reply, Exception):
            raise reply
        return llm.LlmResult(text=reply, prompt_tokens=1, completion_tokens=1, cached_tokens=0)

    monkeypatch.setattr(llm, "complete", complete)
    return state

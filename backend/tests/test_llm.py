import json
import os

import httpx
import pytest

from scientist import llm
from scientist.config import Settings

S = Settings(_env_file=None, openrouter_api_key="k", model="primary", fallback_model="fb",
             hermes_source_path="/tmp/h", hermes_revision="r")


def ok(text="hi", cached=7):
    return {"choices": [{"message": {"content": text}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 2,
                      "prompt_tokens_details": {"cached_tokens": cached}}}


def patch(monkeypatch, handler):
    monkeypatch.setattr(llm, "_transport", httpx.MockTransport(handler))


async def test_system_first_with_cache_marker_and_usage(monkeypatch):
    seen = []

    def h(req):
        seen.append(json.loads(req.content))
        return httpx.Response(200, json=ok())

    patch(monkeypatch, h)
    r = await llm.complete("SYS", "USER", max_tokens=5, json_mode=True, settings=S)
    body = seen[0]
    # OpenRouter docs: cache_control {"type": "ephemeral"} on a content block
    assert body["messages"][0] == {"role": "system", "content": [
        {"type": "text", "text": "SYS", "cache_control": {"type": "ephemeral"}}]}
    assert body["messages"][1] == {"role": "user", "content": "USER"}
    assert body["model"] == "primary" and body["max_tokens"] == 5
    assert body["response_format"] == {"type": "json_object"}
    assert (r.text, r.prompt_tokens, r.completion_tokens, r.cached_tokens) == ("hi", 10, 2, 7)


async def test_blank_raises(monkeypatch):
    patch(monkeypatch, lambda req: httpx.Response(200, json=ok("  ")))
    with pytest.raises(llm.LlmEmptyError):
        await llm.complete("s", "u", max_tokens=5, settings=S)


async def test_5xx_falls_back(monkeypatch):
    models = []

    def h(req):
        m = json.loads(req.content)["model"]
        models.append(m)
        return httpx.Response(503) if m == "primary" else httpx.Response(200, json=ok("fb"))

    patch(monkeypatch, h)
    r = await llm.complete("s", "u", max_tokens=5, settings=S)
    assert models == ["primary", "fb"] and r.text == "fb"


@pytest.mark.parametrize("bad", [
    httpx.Response(200, json=ok("  ")),
    httpx.Response(200, json={"error": {"message": "provider down"}}),
    httpx.Response(200, content=b"not json"),
])
async def test_bad_primary_200_falls_back(monkeypatch, bad):
    def h(req):
        return bad if json.loads(req.content)["model"] == "primary" else httpx.Response(200, json=ok("fb"))

    patch(monkeypatch, h)
    assert (await llm.complete("s", "u", max_tokens=5, settings=S)).text == "fb"


async def test_401_does_not_fall_back(monkeypatch):
    calls = []

    def h(req):
        calls.append(1)
        return httpx.Response(401)

    patch(monkeypatch, h)
    with pytest.raises(httpx.HTTPStatusError):
        await llm.complete("s", "u", max_tokens=5, settings=S)
    assert len(calls) == 1


async def test_usage_logged_without_prompt_or_key(monkeypatch, caplog):
    patch(monkeypatch, lambda req: httpx.Response(200, json=ok("answer text")))
    with caplog.at_level("INFO", logger="scientist.llm"):
        await llm.complete("SECRET SYSTEM", "SECRET USER", max_tokens=5,
                           settings=S.model_copy(update={"openrouter_api_key": "sk-KEYVALUE"}))
    [rec] = [r for r in caplog.records if r.name == "scientist.llm"]
    msg = rec.getMessage()
    assert "model=primary" in msg and "prompt_tokens=10" in msg and "completion_tokens=2" in msg
    assert "cached_tokens=7" in msg
    assert "SECRET" not in caplog.text and "answer text" not in caplog.text and "KEYVALUE" not in caplog.text


@pytest.mark.skipif(os.getenv("LIVE") != "1", reason="live")
async def test_live_cache():
    s = Settings()
    prefix = "Reference text. " * 1500
    for _ in range(2):
        r = await llm.complete(prefix, "Say ok.", max_tokens=10, settings=s)
        print("cached_tokens", r.cached_tokens)

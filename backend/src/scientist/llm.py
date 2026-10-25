import logging

import httpx
from pydantic import BaseModel

from scientist.config import Settings, get_settings

URL = "https://openrouter.ai/api/v1/chat/completions"
_transport: httpx.AsyncBaseTransport | None = None  # tests inject a MockTransport
log = logging.getLogger(__name__)


class LlmEmptyError(Exception):
    pass


class LlmResult(BaseModel):
    text: str
    prompt_tokens: int
    completion_tokens: int
    cached_tokens: int


async def _call(client: httpx.AsyncClient, key: str, body: dict) -> LlmResult:
    r = await client.post(URL, json=body, headers={"Authorization": f"Bearer {key}"})
    r.raise_for_status()
    try:
        d = r.json()
        u = d.get("usage") or {}
        text = d["choices"][0]["message"].get("content") or ""
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as e:
        raise LlmEmptyError(f"malformed response: {e!r}") from e
    if not text.strip():
        raise LlmEmptyError("blank completion")
    result = LlmResult(
        text=text,
        prompt_tokens=u.get("prompt_tokens") or 0,
        completion_tokens=u.get("completion_tokens") or 0,
        cached_tokens=(u.get("prompt_tokens_details") or {}).get("cached_tokens") or 0,
    )
    # usage only (never the key or prompt text): shows on a live run whether prompt caching works
    log.info("llm call model=%s prompt_tokens=%d completion_tokens=%d cached_tokens=%d", body["model"],
             result.prompt_tokens, result.completion_tokens, result.cached_tokens)
    return result


async def complete(system: str, user: str, *, model: str | None = None, max_tokens: int,
                   json_mode: bool = False, settings: Settings | None = None) -> LlmResult:
    s = settings or get_settings()
    body = {
        "max_tokens": max_tokens,
        "messages": [
            # shared prefix first, marked cacheable
            {"role": "system", "content": [
                {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]},
            {"role": "user", "content": user},
        ],
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    async with httpx.AsyncClient(transport=_transport, timeout=120) as c:
        try:
            return await _call(c, s.openrouter_api_key, {**body, "model": model or s.model})
        except (httpx.HTTPError, LlmEmptyError) as e:
            if isinstance(e, httpx.HTTPStatusError) and e.response.status_code < 500 and e.response.status_code != 429:
                raise  # 4xx (bad key/request): fallback would fail the same way
            return await _call(c, s.openrouter_api_key, {**body, "model": s.fallback_model})

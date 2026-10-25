import httpx
import pytest

from scientist.config import Settings, get_settings
from scientist.main import create_app

ENV = {
    "OPENROUTER_API_KEY": "k", "MODEL": "openai/gpt-6-luna", "FALLBACK_MODEL": "f",
    "HERMES_SOURCE_PATH": "/tmp/hermes", "HERMES_REVISION": "abc",
}


@pytest.fixture(autouse=True)
def env(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)  # no stray .env
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_settings_read_model_from_env():
    assert get_settings().model == "openai/gpt-6-luna"


def test_missing_api_key_raises(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY")
    with pytest.raises(Exception):
        Settings()


async def test_health_route_returns_ok():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://t") as c:
        r = await c.get("/v1/health")
    assert r.json() == {"status": "ok"}


def test_empty_api_key_rejected(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    with pytest.raises(Exception):
        get_settings()


def test_token_budget_cap_and_contact_defaults():
    s = get_settings()
    assert (s.guardrail_max_tokens, s.strategy_max_tokens, s.synthesis_max_tokens) == (256, 1500, 4000)
    assert s.max_papers_per_branch == 30 and s.contact_email == ""

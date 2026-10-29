import asyncio
from pathlib import Path

import httpx
import pytest

from scientist import sandbox
from scientist.config import Settings, get_settings
from scientist.hermes import HermesRuntime
from scientist.main import create_app
from test_config import ENV

TLS = {"DOCKER_HOST": "tcp://sandbox:2376", "DOCKER_TLS_VERIFY": "1", "DOCKER_CERT_PATH": "/certs/client"}


def S(**kw):
    return Settings(openrouter_api_key="k", model="m", fallback_model="small", hermes_source_path=".",
                    hermes_revision="x", **kw)


def test_work_dir_defaults_to_home_cache():
    assert sandbox.work_dir(S()) == Path.home() / ".cache/scientist/sandbox"


async def test_work_dir_uses_setting(tmp_path, monkeypatch):
    seen = []

    class Empty:
        async def read(self, n): return b""

    class P:
        returncode, stdout, stderr = 0, Empty(), Empty()
        async def wait(self): return 0

    async def exec_(*cmd, **kw):
        seen.append(Path(next(cmd[i + 1] for i, v in enumerate(cmd) if v == "-v").split(":")[0]))
        assert seen[0].is_dir()
        return P()
    monkeypatch.setattr(asyncio, "create_subprocess_exec", exec_)
    w = tmp_path / "w"
    r = await sandbox.run_analysis(None, b"a\n1\n", "csv", S(sandbox_work_dir=w))
    assert r.error == "no_result" and str(seen[0]).startswith(str(w))
    assert not seen[0].parent.exists()


def test_bridge_env_passes_tls_settings(tmp_path, monkeypatch):
    import scientist.hermes as h
    cache = tmp_path / "c"
    (cache / "skills-src/skills").mkdir(parents=True)
    monkeypatch.setattr(h, "CACHE", cache)
    monkeypatch.setattr(h, "SKILLS_SOURCE", cache / "skills-src")
    monkeypatch.setattr(h, "_check_pinned", lambda *a: None)
    s = S(hermes_runtime_dir=tmp_path / "home", enabled_skills=[])
    for k in TLS:
        monkeypatch.delenv(k, raising=False)
    assert not set(TLS) & set(HermesRuntime(s)._prepare())
    for k, v in TLS.items():
        monkeypatch.setenv(k, v)
    env = HermesRuntime(s)._prepare()
    assert {k: env[k] for k in TLS} == TLS


@pytest.mark.parametrize("reachable,enabled,want", [(True, "true", "ok"), (False, "true", "unreachable"),
                                                    (True, "false", "disabled")])
async def test_health_reports_sandbox(monkeypatch, reachable, enabled, want):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("SANDBOX_ENABLED", enabled)
    get_settings.cache_clear()
    calls = []

    async def fake():
        calls.append(1)
        return reachable
    monkeypatch.setattr(sandbox, "docker_reachable", fake)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://t") as c:
        r = await c.get("/v1/health")
    assert r.status_code == 200 and r.json()["sandbox"] == want
    assert bool(calls) == (enabled == "true")


async def test_docker_reachable_caches(monkeypatch):
    n = []

    async def exec_(*cmd, **kw):
        n.append(cmd)

        class P:
            async def wait(self): return 0
        return P()
    monkeypatch.setattr(sandbox, "_reach", [0.0, False])
    monkeypatch.setattr(asyncio, "create_subprocess_exec", exec_)
    assert await sandbox.docker_reachable() and await sandbox.docker_reachable()
    assert len(n) == 1

    async def missing(*cmd, **kw):
        raise FileNotFoundError
    monkeypatch.setattr(sandbox, "_reach", [0.0, False])
    monkeypatch.setattr(asyncio, "create_subprocess_exec", missing)
    assert await sandbox.docker_reachable() is False


def test_sandbox_init_pulls_the_hermes_image_verbatim():
    from scientist.hermes import SANDBOX_IMAGE
    init = Path(__file__).resolve().parents[2] / "infra/deploy/sandbox-init.sh"
    assert SANDBOX_IMAGE in init.read_text()

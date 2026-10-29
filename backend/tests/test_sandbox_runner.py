import asyncio
import time
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


@pytest.mark.parametrize("reachable,enabled,host,want", [(True, "true", None, "ok"), (False, "true", None, "unreachable"),
                                                         (True, "false", None, "disabled"), (True, "false", "tcp://x:1", "ok"),
                                                         (False, "false", "tcp://x:1", "unreachable")])
async def test_health_reports_sandbox(monkeypatch, reachable, enabled, host, want):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("DOCKER_HOST", raising=False)
    if host:
        monkeypatch.setenv("DOCKER_HOST", host)
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
    assert bool(calls) == (want != "disabled")


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


async def test_daemon_connection_failure_maps_to_docker_unavailable(monkeypatch, tmp_path):
    class R:
        def __init__(self, data): self.data = data
        async def read(self, n): d, self.data = self.data, b""; return d

    class P:
        returncode = 1
        stdout = R(b"")
        stderr = R(b"Cannot connect to the Docker daemon at tcp://sandbox:2376. Is the docker daemon running?")
        async def wait(self): return 1

    async def exec_(*a, **k): return P()
    monkeypatch.setattr(asyncio, "create_subprocess_exec", exec_)
    s = S(sandbox_work_dir=tmp_path)
    r = await sandbox.run_analysis(None, b"a\n1\n", "csv", s)
    assert not r.ok and r.error == "docker_unavailable"


def test_sweep_stale_runs_removes_only_old_run_dirs(tmp_path):
    import os
    old, new, other = tmp_path / "run-old", tmp_path / "run-new", tmp_path / "keep"
    for d in (old, new, other):
        d.mkdir()
    t = time.time() - 7200
    os.utime(old, (t, t)), os.utime(other, (t, t))
    sandbox.sweep_stale_runs(S(sandbox_work_dir=tmp_path))
    assert not old.exists() and new.exists() and other.exists()


async def test_docker_command_per_pack(tmp_path, monkeypatch):
    cmds = []

    class R:
        async def read(self, n): return b""

    class P:
        returncode = 1
        stdout = R()
        stderr = R()
        async def wait(self): return 1

    async def exec_(*a, **k):
        cmds.append(list(a))
        return P()
    monkeypatch.setattr(asyncio, "create_subprocess_exec", exec_)
    s = S(sandbox_work_dir=tmp_path, sandbox_image="base:1", sandbox_science_image="sci:1")
    for pack in (None, "comm", "chem", "bio"):
        await sandbox.run_analysis(None, b"a\n1\n", "csv", s, pack)
    general, comm, chem, bio = cmds

    def norm(c):  # name and the per-run input mount differ by design; the image and the extra-imports env are checked apart
        i = [k for k, x in enumerate(c) if x.startswith("SANDBOX_EXTRA_IMPORTS")]
        rest = [x for k, x in enumerate(c) if not i or k not in (i[0] - 1, i[0])]  # drop "-e SANDBOX_EXTRA_IMPORTS=..."
        return [x for x in rest if not x.startswith(("scientist-sandbox-", str(tmp_path))) and x not in ("base:1", "sci:1")]
    extra = lambda c: [x for x in c if x.startswith("SANDBOX_EXTRA_IMPORTS")]  # noqa: E731
    assert general[-1] == comm[-1] == "base:1" and chem[-1] == bio[-1] == "sci:1"
    assert extra(general) == extra(comm) == [] and extra(chem) == ["SANDBOX_EXTRA_IMPORTS=rdkit"]
    assert extra(bio) == ["SANDBOX_EXTRA_IMPORTS=scanpy,anndata"]
    assert norm(general) == norm(comm) == norm(chem) == norm(bio)
    assert "--network" in general and general[general.index("--network") + 1] == "none" and "--read-only" in chem

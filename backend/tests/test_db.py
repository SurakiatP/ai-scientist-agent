import logging
import secrets
import shutil
import socket
import subprocess
import time
import uuid

import httpx
import psycopg
import pytest
from alembic import command
from alembic.config import Config

from scientist import db as dbmod
from scientist.config import get_settings
from scientist.main import create_app
from test_config import ENV

BACKEND = dbmod.BACKEND_DIR


def _docker_ok() -> bool:
    if not shutil.which("docker"):
        return False
    try:
        return subprocess.run(["docker", "info"], capture_output=True, timeout=15).returncode == 0
    except Exception:
        return False


@pytest.fixture(autouse=True)
def base_env(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)  # no stray .env
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(scope="module")
def pg():
    """Throwaway postgres:17-alpine on a random loopback port with a random password; always removed."""
    if not _docker_ok():
        pytest.skip("docker is not available: real-Postgres tests need the docker CLI")
    name, password = f"scientist-test-pg-{uuid.uuid4().hex[:10]}", secrets.token_urlsafe(18)
    run = subprocess.run(["docker", "run", "-d", "--name", name, "-p", "127.0.0.1::5432", "-e", "POSTGRES_USER=app",
                          "-e", f"POSTGRES_PASSWORD={password}", "-e", "POSTGRES_DB=app", "postgres:17-alpine"],
                         capture_output=True, text=True)
    try:
        if run.returncode:
            pytest.skip(f"cannot start postgres:17-alpine: {run.stderr.strip()[:200]}")
        port = subprocess.run(["docker", "port", name, "5432/tcp"], capture_output=True, text=True).stdout.split(":")[-1].strip()
        for _ in range(60):
            try:
                psycopg.connect(host="127.0.0.1", port=port, user="app", password=password, dbname="app", connect_timeout=2).close()
                break
            except Exception:
                time.sleep(0.5)
        else:
            pytest.fail("throwaway postgres did not become ready")
        yield {"port": port, "password": password}
    finally:
        subprocess.run(["docker", "rm", "-f", "-v", name], capture_output=True)


@pytest.fixture
def newdb(pg, monkeypatch, tmp_path):
    """A fresh empty database in the throwaway server; env points the app at it (password in a file, not the URL)."""
    dbname = f"t_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(host="127.0.0.1", port=pg["port"], user="app", password=pg["password"], dbname="app", autocommit=True) as c:
        c.execute(f'CREATE DATABASE "{dbname}"')
    pwfile = tmp_path / "pw"
    pwfile.write_text(pg["password"] + "\n")
    monkeypatch.chdir(tmp_path)
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("DATABASE_URL", f"postgresql://app@127.0.0.1:{pg['port']}/{dbname}")
    monkeypatch.setenv("DATABASE_PASSWORD_FILE", str(pwfile))
    get_settings.cache_clear()
    yield {"name": dbname, **pg}
    get_settings.cache_clear()


def _alembic() -> Config:
    cfg = Config(str(BACKEND / "alembic.ini"))
    return cfg


def _tables(pg, dbname):
    with psycopg.connect(host="127.0.0.1", port=pg["port"], user="app", password=pg["password"], dbname=dbname) as c:
        return {r[0] for r in c.execute("select tablename from pg_tables where schemaname='public'")}


def test_migration_up_down_up(newdb):
    cfg = _alembic()
    command.upgrade(cfg, "head")
    assert _tables(newdb, newdb["name"]) == {"app_meta", "alembic_version", "projects", "sessions", "turns", "files", "usage_events", "turn_tombstones"}
    with psycopg.connect(host="127.0.0.1", port=newdb["port"], user="app", password=newdb["password"], dbname=newdb["name"]) as c:
        assert c.execute("select value from app_meta where key='schema'").fetchone() == ("1",)
    command.downgrade(cfg, "base")
    assert "app_meta" not in _tables(newdb, newdb["name"])
    command.upgrade(cfg, "head")
    assert "app_meta" in _tables(newdb, newdb["name"])


async def test_ping_and_schema_state_ok_and_behind(newdb):
    d = dbmod.open_database(get_settings())
    try:
        assert await d.ping()
        assert await d.schema_state() == "behind"  # empty database: migrations never ran
        command.upgrade(_alembic(), "head")
        assert await d.schema_state() == "ok"
        assert dbmod.code_head() == "0003"
    finally:
        await d.close()


async def test_schema_state_behind_when_db_has_older_revision(newdb, monkeypatch):
    command.upgrade(_alembic(), "head")
    d = dbmod.open_database(get_settings())
    try:
        monkeypatch.setattr(dbmod, "code_head", lambda: "9999")
        assert await d.schema_state() == "behind"
    finally:
        await d.close()


async def _health(**kw):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(**kw)), base_url="http://t") as c:
        r = await c.get("/v1/health")
    assert r.status_code == 200
    return r.json()["db"]


async def test_health_states_with_real_db(newdb):
    assert await _health() == "behind"
    command.upgrade(_alembic(), "head")
    assert await _health() == "ok"


async def test_health_disabled_without_url(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    get_settings.cache_clear()
    assert await _health() == "disabled"
    get_settings.cache_clear()


async def test_health_unavailable_and_boot_survives_dead_db(monkeypatch, tmp_path):
    with socket.socket() as s:  # a port nobody listens on
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    monkeypatch.chdir(tmp_path)
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("DATABASE_URL", f"postgresql://app:x@127.0.0.1:{port}/app")
    monkeypatch.setenv("DB_CONNECT_TIMEOUT_S", "1")
    get_settings.cache_clear()
    assert await _health() == "unavailable"
    get_settings.cache_clear()


@pytest.mark.parametrize("state,shown", [("ok", "ok"), ("behind", "behind"), ("unreachable", "unavailable")])
async def test_health_with_fake_db(state, shown):
    class Fake:
        async def schema_state(self):
            return state
    assert await _health(db=Fake()) == shown


async def test_health_never_fails_when_probe_raises():
    class Boom:
        async def schema_state(self):
            raise RuntimeError("boom")
    assert await _health(db=Boom()) == "unavailable"


async def test_statement_timeout_applies(newdb, monkeypatch):
    monkeypatch.setenv("DB_STATEMENT_TIMEOUT_MS", "300")
    get_settings.cache_clear()
    d = dbmod.open_database(get_settings())
    try:
        from sqlalchemy import text
        async with d.session() as s:
            assert (await s.execute(text("show statement_timeout"))).scalar() == "300ms"
            with pytest.raises(Exception, match="statement timeout"):
                await s.execute(text("select pg_sleep(3)"))
    finally:
        await d.close()


async def test_password_file_injected_and_never_leaks(newdb, caplog):
    caplog.set_level(logging.DEBUG)
    s = get_settings()
    url = dbmod.build_url(s)
    assert url.password == newdb["password"]  # injected from the file; the URL in settings has none
    assert newdb["password"] not in s.database_url
    d = dbmod.open_database(s)
    try:
        assert newdb["password"] not in repr(d.engine) and newdb["password"] not in repr(d.engine.url)
        assert await d.ping()
    finally:
        await d.close()
    assert newdb["password"] not in caplog.text


async def test_bound_parameters_not_interpolated(newdb):
    command.upgrade(_alembic(), "head")
    from sqlalchemy import text
    evil = "x'); DROP TABLE app_meta; --"
    d = dbmod.open_database(get_settings())
    try:
        async with d.session() as s:
            await s.execute(text("insert into app_meta(key, value) values (:k, :v)"), {"k": "evil", "v": evil})
            await s.commit()
            assert (await s.execute(text("select value from app_meta where key = :k"), {"k": "evil"})).scalar() == evil
    finally:
        await d.close()

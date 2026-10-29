import asyncio

import psycopg
import pytest
from alembic import command
from sqlalchemy import text

from scientist import db as dbmod
from scientist.config import get_settings
from scientist.pgbus import GAP, PgBus
from test_config import ENV
from test_db import _alembic, newdb, pg  # noqa: F401  (throwaway-Postgres fixtures)


@pytest.fixture(autouse=True)
def _env(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
async def buses(newdb):
    s = get_settings()
    a, b = PgBus(s), PgBus(s)
    await a.start()
    await b.start()
    d = dbmod.open_database(s)
    yield a, b, d
    await a.stop()
    await b.stop()
    await d.close()


async def got(it, timeout=5):
    return await asyncio.wait_for(anext(it), timeout)


async def test_notify_reaches_both_processes(buses):
    a, b, _ = buses
    async with a.subscribe("runs") as ia, b.subscribe("runs") as ib, b.subscribe("run_cancel") as other:
        await a.notify("runs", "hello")
        assert await got(ia) == "hello" and await got(ib) == "hello"
        await b.notify("run_cancel", "x")
        assert await got(other) == "x"
        with pytest.raises(asyncio.TimeoutError):  # channels are separate
            await got(ia, 0.3)


async def test_notify_in_session_waits_for_commit_and_skips_rollback(buses):
    a, _, d = buses
    async with a.subscribe("run_events") as it:
        async with d.session() as s:
            await a.notify("run_events", "rolled", session=s)
            await s.rollback()
        async with d.session() as s:
            await a.notify("run_events", "kept", session=s)
            with pytest.raises(asyncio.TimeoutError):
                await got(it, 0.5)  # still uncommitted
            await s.commit()
        assert await got(it) == "kept"  # the rolled back one never arrived


async def test_payload_cap(buses):
    a, _, _ = buses
    await a.notify("runs", "x" * 7900)
    with pytest.raises(ValueError):
        await a.notify("runs", "x" * 7901)
    with pytest.raises(ValueError):
        await a.notify("runs", "é" * 3951)  # bytes, not characters
    with pytest.raises(ValueError):
        await a.notify("nope", "x")


async def test_reconnect_yields_gap_then_resumes(buses, newdb):
    a, b, _ = buses
    async with a.subscribe("store_changes") as it:
        with psycopg.connect(host="127.0.0.1", port=newdb["port"], user="app", password=newdb["password"], dbname=newdb["name"], autocommit=True) as c:
            c.execute("select pg_terminate_backend(%s)", (a.backend_pid,))
        assert await got(it, 10) is GAP
        await b.notify("store_changes", "after")
        assert await got(it, 10) == "after"


async def test_migration_adds_lease_columns_and_backfills_pool(newdb):
    cfg = _alembic()
    command.upgrade(cfg, "0008")
    rows = [("analyze", None), ("ask", "docs"), ("ask", "deep"), ("ask", None)]
    with psycopg.connect(host="127.0.0.1", port=newdb["port"], user="app", password=newdb["password"], dbname=newdb["name"], autocommit=True) as c:
        for i, (kind, mode) in enumerate(rows):
            c.execute("insert into runs(id, client_id, kind, mode, status) values (gen_random_uuid(), 'c', %s, %s, 'done')", (kind, mode))
        command.upgrade(cfg, "head")
        got_ = c.execute("select kind, mode, pool, attempt, cancel_requested, worker, lease_until, served_at from runs order by kind, mode").fetchall()
        assert {(k, m): p for k, m, p, *_ in got_} == {("analyze", None): "analysis", ("ask", "docs"): "analysis", ("ask", "deep"): "research", ("ask", None): "research"}
        assert all(r[3] == 1 and r[4] is False and r[5:] == (None, None, None) for r in got_)
        assert c.execute("select 1 from pg_indexes where indexname='runs_status_pool'").fetchone()
        command.downgrade(cfg, "0008")
        cols = {r[0] for r in c.execute("select column_name from information_schema.columns where table_name='runs'")}
        assert not cols & {"worker", "lease_until", "attempt", "cancel_requested", "pool", "served_at"}


def test_settings_defaults():
    s = get_settings()
    assert (s.run_lease_seconds, s.run_max_attempts, s.scheduler_poll_seconds) == (30, 2, 2.0)

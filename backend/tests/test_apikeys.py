import json
import os
import re
import subprocess
import sys

import httpx
import psycopg
import pytest
from alembic import command
from fastapi import Depends

from scientist import apikeys
from scientist.main import create_app
from test_db import _alembic, newdb, pg  # noqa: F401  (throwaway-Postgres fixtures)
from test_store import _env  # noqa: F401

@pytest.fixture
async def api(newdb):
    command.upgrade(_alembic(), "head")
    app = create_app()

    @app.get("/_whoami")
    async def whoami(k: apikeys.ApiKey = Depends(apikeys.require_key)):
        return {"id": k.id, "name": k.name}

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        c.app, c.db = app, newdb
        yield c
    await app.state.db.close()


def sql(db, q, *a):
    with psycopg.connect(host="127.0.0.1", port=db["port"], user="app", password=db["password"], dbname=db["name"], autocommit=True) as c:
        cur = c.execute(q, a)
        return cur.fetchall() if cur.description else None


def bearer(k):
    return {"authorization": f"Bearer {k}"}


async def mk(api, name="ci"):
    async with api.app.state.db.session() as s:
        return await apikeys.create(s, name)


def test_key_format_and_hash():
    k = apikeys.new_key()
    assert re.fullmatch(r"sci_[A-Za-z0-9_-]{43}", k) and k != apikeys.new_key()
    assert apikeys.hash_key(k) == __import__("hashlib").sha256(k.encode()).hexdigest()


async def test_only_hash_and_prefix_are_stored(api):
    key, row = await mk(api)
    assert row["prefix"] == key[:12]
    rows = sql(api.db, "select name, prefix, hash from api_keys")
    assert rows == [("ci", key[:12], apikeys.hash_key(key))]
    assert key not in json.dumps(sql(api.db, "select * from api_keys"), default=str)
    assert "hash" not in (await listing(api))[0]


async def listing(api):
    async with api.app.state.db.session() as s:
        return await apikeys.list_keys(s)


async def test_valid_key_passes_and_name_limit(api):
    key, row = await mk(api)
    r = await api.get("/_whoami", headers=bearer(key))
    assert r.status_code == 200 and r.json() == {"id": row["id"], "name": "ci"}
    with pytest.raises(ValueError):
        await mk(api, "x" * 81)
    with pytest.raises(ValueError):
        await mk(api, "  ")


async def test_bad_keys_all_give_the_same_401(api):
    key, row = await mk(api)
    async with api.app.state.db.session() as s:
        assert await apikeys.revoke(s, row["prefix"]) == 1
    cases = [{}, {"authorization": "Basic abc"}, {"authorization": "Bearer"}, {"authorization": "Bearer nope"},
             bearer("sci_" + "A" * 43), bearer(key)]  # none, wrong scheme, empty, malformed, unknown, revoked
    for h in cases:
        r = await api.get("/_whoami", headers=h)
        assert r.status_code == 401 and r.headers["www-authenticate"] == "Bearer"
    assert len({(await api.get("/_whoami", headers=h)).text for h in cases}) == 1
    assert key not in (await api.get("/_whoami", headers=bearer(key))).text


async def test_revoke_takes_effect_on_next_request(api):
    key, row = await mk(api)
    assert (await api.get("/_whoami", headers=bearer(key))).status_code == 200
    async with api.app.state.db.session() as s:
        await apikeys.revoke(s, row["prefix"])
    assert (await api.get("/_whoami", headers=bearer(key))).status_code == 401


async def test_last_used_updates_at_most_once_a_minute(api):
    key, row = await mk(api)
    q = "select last_used_at from api_keys"
    assert sql(api.db, q) == [(None,)]
    await api.get("/_whoami", headers=bearer(key))
    first = sql(api.db, q)[0][0]
    assert first is not None
    await api.get("/_whoami", headers=bearer(key))
    assert sql(api.db, q)[0][0] == first  # within the minute: untouched
    sql(api.db, "update api_keys set last_used_at = now() - interval '2 minutes'")
    await api.get("/_whoami", headers=bearer(key))
    assert sql(api.db, "select last_used_at > now() - interval '1 minute' from api_keys") == [(True,)]


async def test_rate_limit_is_per_key_and_uses_the_write_budget(api):
    api.app.state.settings.store_write_rate_per_min = 2
    k1, _ = await mk(api, "a")
    k2, _ = await mk(api, "b")
    assert [(await api.get("/_whoami", headers=bearer(k1))).status_code for _ in range(3)] == [200, 200, 429]
    assert (await api.get("/_whoami", headers=bearer(k2))).status_code == 200  # other key, same IP: own budget


def cli(*args):
    return subprocess.run([sys.executable, "-m", "scientist.apikeys", *args], capture_output=True, text=True, env=os.environ.copy())


def test_cli_create_list_revoke(newdb):
    command.upgrade(_alembic(), "head")
    c = cli("create", "--name", "laptop")
    assert c.returncode == 0
    key = re.search(r"sci_[A-Za-z0-9_-]{43}", c.stdout).group(0)
    assert key not in c.stderr
    ls = cli("list")
    assert ls.returncode == 0 and key[:12] in ls.stdout and "laptop" in ls.stdout
    assert key not in ls.stdout and apikeys.hash_key(key) not in ls.stdout
    assert sql(newdb, "select count(*) from api_keys where hash = %s", apikeys.hash_key(key)) == [(1,)]
    rv = cli("revoke", key[:12])
    assert rv.returncode == 0 and key not in rv.stdout
    assert sql(newdb, "select revoked_at is not null from api_keys") == [(True,)]
    assert "revoked" in cli("list").stdout
    assert cli("revoke", key[:12]).returncode == 1  # nothing active left
    assert cli("revoke", "sci_zzzzzzzz").returncode == 1
    assert cli("create", "--name", "").returncode == 2

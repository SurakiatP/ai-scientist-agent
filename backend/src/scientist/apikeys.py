"""Operator-issued API keys for the public API. Only the sha256 of a key is stored; the CLI prints a new key once.

    uv run --project backend python -m scientist.apikeys create --name "<name>" | list | revoke <prefix>
"""
import argparse
import asyncio
import hashlib
import re
import secrets
import sys
import uuid
from dataclasses import dataclass

import sqlalchemy as sa
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from scientist.models import api_keys
from scientist.routes_store import data, rate_limit
from scientist.store import Store

bearer = HTTPBearer(auto_error=False)  # parses the header and puts the bearer scheme in the OpenAPI document; the 401 below stays ours
KEY_RE = re.compile(r"sci_[A-Za-z0-9_-]{43}")
PREFIX_LEN = 12
NAME_MAX = 80


@dataclass(frozen=True)
class ApiKey:
    id: str
    name: str

    @property
    def client_id(self) -> str:  # RunQueue client id: never collides with a browser's
        return f"key:{self.id}"


def new_key() -> str:
    return "sci_" + secrets.token_urlsafe(32)


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


async def create(s, name: str) -> tuple[str, dict]:
    name = name.strip()
    if not name or len(name) > NAME_MAX:
        raise ValueError(f"name must be 1-{NAME_MAX} characters")
    key, kid = new_key(), str(uuid.uuid4())
    await s.execute(sa.insert(api_keys).values(id=kid, name=name, prefix=key[:PREFIX_LEN], hash=hash_key(key)))
    await s.commit()
    return key, {"id": kid, "name": name, "prefix": key[:PREFIX_LEN]}


async def list_keys(s) -> list[dict]:
    q = sa.select(api_keys.c.id, api_keys.c.name, api_keys.c.prefix, api_keys.c.created_at, api_keys.c.revoked_at,
                  api_keys.c.last_used_at).order_by(api_keys.c.created_at)
    return [dict(r._mapping) for r in await s.execute(q)]


async def revoke(s, prefix: str) -> int:
    """Revokes the active keys with this prefix; returns how many (a prefix is 8 random chars, so 0 or 1)."""
    r = await s.execute(sa.update(api_keys).where(api_keys.c.prefix == prefix, api_keys.c.revoked_at.is_(None))
                        .values(revoked_at=sa.func.now()))
    await s.commit()
    return r.rowcount


async def verify(s, key: str) -> ApiKey | None:
    """The active key row for this key, or None. Touches last_used_at at most once a minute."""
    if not KEY_RE.fullmatch(key):
        return None
    row = (await s.execute(sa.select(api_keys.c.id, api_keys.c.name).where(
        api_keys.c.hash == hash_key(key), api_keys.c.revoked_at.is_(None)))).first()
    if row is None:
        return None
    await s.execute(sa.update(api_keys).where(api_keys.c.id == row.id, sa.or_(
        api_keys.c.last_used_at.is_(None), api_keys.c.last_used_at < sa.func.now() - sa.text("interval '1 minute'")))
        .values(last_used_at=sa.func.now()))
    await s.commit()
    return ApiKey(row.id, row.name)


async def require_key(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                      st: Store = Depends(data)) -> ApiKey:
    """FastAPI dependency: `Authorization: Bearer sci_...`. Every failure is the same 401, counted per client IP
    (guessing is rate limited). Applies the per-key rate limit."""
    bucket = "authfail:" + (request.client.host if request.client else "?")
    rate_limit(st, bucket, hit=False)  # a throttled guesser costs no database query
    k = None
    if creds is not None:
        async with st.db.session() as s:
            k = await verify(s, creds.credentials.strip())
    if k is None:
        rate_limit(st, bucket)
        raise HTTPException(401, "invalid or missing API key", headers={"WWW-Authenticate": "Bearer"})
    rate_limit(st, k.client_id)
    return k


async def _cli(args) -> int:
    from scientist.config import get_settings
    from scientist.db import open_database
    db = open_database(get_settings())
    if db is None:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1
    try:
        async with db.session() as s:
            if args.cmd == "create":
                key, row = await create(s, args.name)
                print(f"created {row['name']!r} ({row['prefix']}); this key is shown once, store it now:\n{key}")
            elif args.cmd == "list":
                for r in await list_keys(s):
                    state = f"revoked {r['revoked_at']:%Y-%m-%d}" if r["revoked_at"] else "active"
                    used = f"{r['last_used_at']:%Y-%m-%d %H:%M}" if r["last_used_at"] else "never"
                    print(f"{r['prefix']}  {state:<19} last used {used:<16} {r['name']}")
            elif await revoke(s, args.prefix) == 0:
                print("no active key with that prefix", file=sys.stderr)
                return 1
            else:
                print("revoked")
    finally:
        await db.close()
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m scientist.apikeys")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create")
    c.add_argument("--name", required=True)
    sub.add_parser("list")
    sub.add_parser("revoke").add_argument("prefix")
    args = p.parse_args(argv)
    if args.cmd == "create" and not 0 < len(args.name.strip()) <= NAME_MAX:
        p.error(f"--name must be 1-{NAME_MAX} characters")
    return asyncio.run(_cli(args))


if __name__ == "__main__":
    sys.exit(main())

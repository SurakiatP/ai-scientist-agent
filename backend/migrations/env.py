"""Alembic env: sync psycopg engine built from the same settings as the app (DATABASE_URL + DATABASE_PASSWORD_FILE)."""
from alembic import context
from sqlalchemy import create_engine, pool

from scientist.config import get_settings
from scientist.db import build_url

config = context.config


def run() -> None:
    settings = get_settings()
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is empty: nothing to migrate")
    url = build_url(settings)
    engine = create_engine(url, poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=None)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run()

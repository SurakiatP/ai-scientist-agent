"""PostgreSQL access: async engine (psycopg 3), health probes. Everything is optional: no DATABASE_URL = no database."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from scientist.config import Settings

log = logging.getLogger(__name__)
BACKEND_DIR = Path(__file__).resolve().parents[2]  # backend/ (also /app/backend in the image)


def build_url(settings: Settings) -> URL:
    """DATABASE_URL with the psycopg driver forced and the password from DATABASE_PASSWORD_FILE when set."""
    url = make_url(settings.database_url)
    url = url.set(drivername="postgresql+psycopg")
    if settings.database_password_file:
        url = url.set(password=Path(settings.database_password_file).read_text().strip())
    return url


def create_engine(settings: Settings) -> AsyncEngine:
    return create_async_engine(
        build_url(settings), pool_size=settings.db_pool_size, max_overflow=settings.db_max_overflow, pool_pre_ping=True,
        hide_parameters=True,  # never echo bound values in errors/logs
        connect_args={"connect_timeout": settings.db_connect_timeout_s,
                      "options": f"-c statement_timeout={int(settings.db_statement_timeout_ms)}"})


def code_head() -> str:
    cfg = Config()
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return ScriptDirectory.from_config(cfg).get_current_head()


class Database:
    def __init__(self, engine: AsyncEngine):
        self.engine = engine
        self._sessions = async_sessionmaker(engine, expire_on_commit=False)

    @asynccontextmanager
    async def session(self):
        async with self._sessions() as s:
            yield s

    async def ping(self) -> bool:
        try:
            async with self.engine.connect() as c:
                await c.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    async def schema_state(self) -> str:
        """'ok' | 'behind' | 'unreachable'. Connects lazily on every call, so a DB that was down at boot recovers."""
        try:
            async with self.engine.connect() as c:
                try:
                    row = (await c.execute(text("SELECT version_num FROM alembic_version"))).first()
                except Exception:  # table missing: migrations never ran
                    return "behind"
            return "ok" if row and row[0] == code_head() else "behind"
        except Exception:
            return "unreachable"

    async def close(self) -> None:
        await self.engine.dispose()


def open_database(settings: Settings) -> Database | None:
    """None when disabled. create_async_engine does not connect, so a down DB at boot cannot crash the app."""
    if not settings.database_url:
        return None
    try:
        return Database(create_engine(settings))
    except Exception:
        log.exception("database engine could not be created")  # bad URL / unreadable password file; message never holds the password
        return None

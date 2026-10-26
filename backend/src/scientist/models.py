"""Core tables (SQLAlchemy Core). Mirrors migrations/versions/0002_core.py; a test compares them."""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

md = sa.MetaData()
NOW = sa.text("now()")
UUID = pg.UUID(as_uuid=False)


def _ts(name, **kw):
    return sa.Column(name, sa.DateTime(timezone=True), **kw)


projects = sa.Table(
    "projects", md, sa.Column("id", UUID, primary_key=True), sa.Column("name", sa.Text, nullable=False),
    _ts("created_at", nullable=False, server_default=NOW), _ts("updated_at", nullable=False, server_default=NOW),
    _ts("deleted_at"), sa.Column("version", sa.Integer, nullable=False, server_default="1"), sa.Column("owner", sa.Text))
sessions = sa.Table(
    "sessions", md, sa.Column("id", UUID, primary_key=True),
    sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="SET NULL")), sa.Column("title", sa.Text),
    _ts("created_at", nullable=False, server_default=NOW), _ts("updated_at", nullable=False, server_default=NOW),
    _ts("deleted_at"), sa.Column("version", sa.Integer, nullable=False, server_default="1"),
    _ts("sort_ts", nullable=False, server_default=NOW), sa.Column("owner", sa.Text))
turns = sa.Table(
    "turns", md, sa.Column("id", UUID, primary_key=True),
    sa.Column("session_id", UUID, sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
    sa.Column("idx", sa.Integer, nullable=False), sa.Column("question", sa.Text, nullable=False),
    sa.Column("mode", sa.Text), sa.Column("status", sa.Text, nullable=False), sa.Column("answer", pg.JSONB),
    sa.Column("progress", pg.JSONB), sa.Column("plan", pg.JSONB), sa.Column("analysis", pg.JSONB),
    sa.Column("refused", sa.Text), sa.Column("error", sa.Text),
    _ts("created_at", nullable=False, server_default=NOW), _ts("updated_at", nullable=False, server_default=NOW),
    sa.Column("version", sa.Integer, nullable=False, server_default="1"), sa.Column("run_id", UUID))
files = sa.Table(
    "files", md, sa.Column("id", sa.CHAR(32), primary_key=True), sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="SET NULL")),
    sa.Column("name", sa.Text, nullable=False), sa.Column("size", sa.BigInteger, nullable=False, server_default="0"),
    sa.Column("kind", sa.Text, nullable=False, server_default=""), _ts("added_at", nullable=False, server_default=NOW),
    _ts("deleted_at"), sa.Column("version", sa.Integer, nullable=False, server_default="1"), sa.Column("owner", sa.Text))
usage_events = sa.Table(
    "usage_events", md, sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
    _ts("at", nullable=False, server_default=NOW), sa.Column("session_id", UUID), sa.Column("turn_id", UUID),
    sa.Column("mode", sa.Text, nullable=False), sa.Column("phase_seconds", pg.JSONB),
    sa.Column("llm_calls", sa.Integer, nullable=False, server_default="0"), sa.Column("prompt_tokens", sa.Integer),
    sa.Column("completion_tokens", sa.Integer), sa.Column("cost_usd", sa.Numeric(10, 6)),
    sa.Column("papers_found", sa.Integer), sa.Column("ok", sa.Boolean, nullable=False))
turn_tombstones = sa.Table(
    "turn_tombstones", md, sa.Column("id", UUID, primary_key=True), sa.Column("session_id", UUID, nullable=False),
    _ts("created_at", nullable=False, server_default=NOW))

runs = sa.Table(
    "runs", md, sa.Column("id", UUID, primary_key=True), sa.Column("client_id", sa.Text, nullable=False),
    sa.Column("session_id", UUID), sa.Column("turn_id", UUID), sa.Column("kind", sa.Text, nullable=False),
    sa.Column("mode", sa.Text), sa.Column("request", pg.JSONB), sa.Column("status", sa.Text, nullable=False),
    _ts("created_at", nullable=False, server_default=NOW), _ts("started_at"), _ts("finished_at"), sa.Column("error", sa.Text))
run_events = sa.Table(
    "run_events", md, sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("seq", sa.Integer, primary_key=True), _ts("at", nullable=False, server_default=NOW),
    sa.Column("event", pg.JSONB, nullable=False))

"""Core shared data: projects, sessions, turns, files, usage_events.

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

NOW = sa.text("now()")


def _ts(name: str, **kw) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), **kw)


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", pg.UUID(as_uuid=False), primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        _ts("created_at", nullable=False, server_default=NOW),
        _ts("updated_at", nullable=False, server_default=NOW),
        _ts("deleted_at"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("owner", sa.Text),
        sa.CheckConstraint("char_length(name) <= 120", name="projects_name_len"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", pg.UUID(as_uuid=False), primary_key=True),
        sa.Column("project_id", pg.UUID(as_uuid=False), sa.ForeignKey("projects.id", ondelete="SET NULL")),
        sa.Column("title", sa.Text),
        _ts("created_at", nullable=False, server_default=NOW),
        _ts("updated_at", nullable=False, server_default=NOW),
        _ts("deleted_at"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        _ts("sort_ts", nullable=False, server_default=NOW),
        sa.Column("owner", sa.Text),
        sa.CheckConstraint("char_length(title) <= 200", name="sessions_title_len"),
    )
    op.create_table(
        "turns",
        sa.Column("id", pg.UUID(as_uuid=False), primary_key=True),
        sa.Column("session_id", pg.UUID(as_uuid=False), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("idx", sa.Integer, nullable=False),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("mode", sa.Text),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("answer", pg.JSONB),
        sa.Column("progress", pg.JSONB),
        sa.Column("plan", pg.JSONB),
        sa.Column("analysis", pg.JSONB),
        sa.Column("refused", sa.Text),
        sa.Column("error", sa.Text),
        _ts("created_at", nullable=False, server_default=NOW),
        _ts("updated_at", nullable=False, server_default=NOW),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.UniqueConstraint("session_id", "idx", name="turns_session_idx"),
        sa.CheckConstraint("char_length(question) <= 4000", name="turns_question_len"),
        sa.CheckConstraint("mode in ('deep','quick','chat','analysis')", name="turns_mode"),
        sa.CheckConstraint("status in ('running','done','refused','error','stopped','interrupted','awaiting_plan')",
                           name="turns_status"),
    )
    op.create_table(
        "files",
        sa.Column("id", sa.CHAR(32), primary_key=True),
        sa.Column("project_id", pg.UUID(as_uuid=False), sa.ForeignKey("projects.id", ondelete="SET NULL")),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("size", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("kind", sa.Text, nullable=False, server_default=""),
        _ts("added_at", nullable=False, server_default=NOW),
        _ts("deleted_at"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("owner", sa.Text),
        sa.CheckConstraint("char_length(name) <= 120", name="files_name_len"),
    )
    op.create_table(
        "usage_events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        _ts("at", nullable=False, server_default=NOW),
        sa.Column("session_id", pg.UUID(as_uuid=False)),
        sa.Column("turn_id", pg.UUID(as_uuid=False)),
        sa.Column("mode", sa.Text, nullable=False),
        sa.Column("phase_seconds", pg.JSONB),
        sa.Column("llm_calls", sa.Integer, nullable=False, server_default="0"),
        sa.Column("prompt_tokens", sa.Integer),
        sa.Column("completion_tokens", sa.Integer),
        sa.Column("cost_usd", sa.Numeric(10, 6)),
        sa.Column("papers_found", sa.Integer),
        sa.Column("ok", sa.Boolean, nullable=False),
    )
    op.create_index("sessions_updated", "sessions", [sa.text("updated_at desc")], postgresql_where=sa.text("deleted_at is null"))
    op.create_index("turns_session_idx_ix", "turns", ["session_id", "idx"])
    op.create_index("files_added", "files", [sa.text("added_at desc")])
    op.create_index("usage_events_at", "usage_events", ["at"])


def downgrade() -> None:
    for t in ("usage_events", "files", "turns", "sessions", "projects"):
        op.drop_table(t)

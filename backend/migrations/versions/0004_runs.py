"""runs and run_events (server-owned runs), turns.run_id.

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def _ts(name: str, **kw) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), **kw)


def upgrade() -> None:
    op.create_table(
        "runs",
        sa.Column("id", pg.UUID(as_uuid=False), primary_key=True),
        sa.Column("client_id", sa.Text, nullable=False),
        sa.Column("session_id", pg.UUID(as_uuid=False)),
        sa.Column("turn_id", pg.UUID(as_uuid=False)),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("mode", sa.Text),
        sa.Column("request", pg.JSONB),
        sa.Column("status", sa.Text, nullable=False),
        _ts("created_at", nullable=False, server_default=sa.text("now()")),
        _ts("started_at"),
        _ts("finished_at"),
        sa.Column("error", sa.Text),
    )
    op.create_index("runs_status", "runs", ["status"])
    op.create_index("runs_client_status", "runs", ["client_id", "status"])
    op.create_table(
        "run_events",
        sa.Column("run_id", pg.UUID(as_uuid=False), sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seq", sa.Integer, nullable=False),
        _ts("at", nullable=False, server_default=sa.text("now()")),
        sa.Column("event", pg.JSONB, nullable=False),
        sa.PrimaryKeyConstraint("run_id", "seq"),
    )
    op.add_column("turns", sa.Column("run_id", pg.UUID(as_uuid=False)))


def downgrade() -> None:
    op.drop_column("turns", "run_id")
    op.drop_table("run_events")
    op.drop_table("runs")

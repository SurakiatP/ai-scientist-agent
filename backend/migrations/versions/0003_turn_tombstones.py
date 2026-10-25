"""turn_tombstones: ids of turns removed by an edit, so a stale client cannot re-create them.

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "turn_tombstones",
        sa.Column("id", pg.UUID(as_uuid=False), primary_key=True),
        sa.Column("session_id", pg.UUID(as_uuid=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("turn_tombstones_created", "turn_tombstones", ["created_at"])


def downgrade() -> None:
    op.drop_table("turn_tombstones")

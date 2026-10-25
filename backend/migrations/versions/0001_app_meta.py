"""app_meta: tiny key/value table proving migrations end to end

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None


def upgrade() -> None:
    meta = op.create_table(
        "app_meta",
        sa.Column("key", sa.Text, primary_key=True),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.bulk_insert(meta, [{"key": "schema", "value": "1"}])


def downgrade() -> None:
    op.drop_table("app_meta")

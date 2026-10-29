"""operator-issued API keys for the public API; only the sha256 of a key is stored.

Revision ID: 0008
Revises: 0007
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_keys", sa.Column("id", pg.UUID(as_uuid=False), primary_key=True), sa.Column("name", sa.Text, nullable=False),
        sa.Column("prefix", sa.Text, nullable=False), sa.Column("hash", sa.Text, nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("revoked_at", sa.DateTime(timezone=True)), sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("char_length(name) <= 80", name="api_keys_name"))


def downgrade() -> None:
    op.drop_table("api_keys")

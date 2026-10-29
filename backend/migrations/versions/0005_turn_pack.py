"""turns.pack: the domain pack a turn was asked with (NULL = General / older turns).

Revision ID: 0005
Revises: 0004
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("turns", sa.Column("pack", sa.Text))


def downgrade() -> None:
    op.drop_column("turns", "pack")

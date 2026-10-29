"""turns may be 'docs' turns (questions answered from attached PDFs); doc_index keeps the sha256 of the bytes it indexed.

Revision ID: 0007
Revises: 0006
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("turns_mode", "turns")
    op.create_check_constraint("turns_mode", "turns", "mode in ('deep','quick','chat','analysis','docs')")
    op.add_column("doc_index", sa.Column("sha256", sa.Text))


def downgrade() -> None:
    op.drop_column("doc_index", "sha256")
    op.execute("delete from turns where mode = 'docs'")
    op.drop_constraint("turns_mode", "turns")
    op.create_check_constraint("turns_mode", "turns", "mode in ('deep','quick','chat','analysis')")

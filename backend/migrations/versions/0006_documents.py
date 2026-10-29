"""PDF text index: doc_index (one row per file, the once-only guard) and doc_chunks (page-bound passages, full-text searchable).

Revision ID: 0006
Revises: 0005
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "doc_index",
        sa.Column("file_id", sa.CHAR(32), sa.ForeignKey("files.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("status", sa.Text, nullable=False), sa.Column("pages", sa.Integer, nullable=False, server_default="0"),
        sa.Column("chunks", sa.Integer, nullable=False, server_default="0"),
        sa.Column("truncated", sa.Boolean, nullable=False, server_default="false"), sa.Column("error", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("status in ('indexing','ready','failed')", name="doc_index_status"))
    op.create_table(
        "doc_chunks",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("file_id", sa.CHAR(32), sa.ForeignKey("files.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page", sa.Integer, nullable=False), sa.Column("idx", sa.Integer, nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("tsv", pg.TSVECTOR, sa.Computed("to_tsvector('simple', text)", persisted=True)))
    op.create_index("doc_chunks_file", "doc_chunks", ["file_id", "idx"], unique=True)
    op.create_index("doc_chunks_tsv", "doc_chunks", ["tsv"], postgresql_using="gin")


def downgrade() -> None:
    op.drop_table("doc_chunks")
    op.drop_table("doc_index")

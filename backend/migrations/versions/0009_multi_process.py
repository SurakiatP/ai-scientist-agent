"""run leases for several backend processes: owner, lease, attempt, cancel flag, pool, claim time.

Revision ID: 0009
Revises: 0008
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

NEW = ("worker", "lease_until", "attempt", "crashes", "cancel_requested", "pool", "served_at")


def upgrade() -> None:
    op.add_column("runs", sa.Column("worker", sa.Text))
    op.add_column("runs", sa.Column("lease_until", sa.DateTime(timezone=True)))
    op.add_column("runs", sa.Column("attempt", sa.Integer, nullable=False, server_default="1"))
    op.add_column("runs", sa.Column("crashes", sa.Integer, nullable=False, server_default="0"))  # restarts after a crash; attempt also counts graceful releases
    op.add_column("runs", sa.Column("cancel_requested", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("runs", sa.Column("pool", sa.Text))
    op.add_column("runs", sa.Column("served_at", sa.DateTime(timezone=True)))
    op.execute("update runs set pool = case when kind = 'analyze' or mode = 'docs' then 'analysis' else 'research' end")
    # unfinished runs from before this version have no owner: an expired lease lets the sweep handle them
    op.execute("update runs set lease_until = now() where status in ('queued', 'running')")
    op.create_index("runs_status_pool", "runs", ["status", "pool"])


def downgrade() -> None:
    op.drop_index("runs_status_pool", "runs")
    for c in NEW:
        op.drop_column("runs", c)

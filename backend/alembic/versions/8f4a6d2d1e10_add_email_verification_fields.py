"""add email verification fields to users

Revision ID: 8f4a6d2d1e10
Revises: c231dddcca3e
Create Date: 2026-03-20 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8f4a6d2d1e10"
down_revision: Union[str, Sequence[str], None] = "c231dddcca3e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("email_code_hash", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("email_code_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("email_code_sent_at", sa.DateTime(timezone=True), nullable=True))

    op.alter_column("users", "email_verified", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "email_code_sent_at")
    op.drop_column("users", "email_code_expires_at")
    op.drop_column("users", "email_code_hash")
    op.drop_column("users", "email_verified")

"""auth profile hardening

Revision ID: b9c2f0c0a441
Revises: 8f4a6d2d1e10
Create Date: 2026-03-20 19:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b9c2f0c0a441"
down_revision: Union[str, Sequence[str], None] = "8f4a6d2d1e10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("users")}

    if "name" not in columns:
        op.add_column("users", sa.Column("name", sa.String(length=120), nullable=True))
        op.execute("UPDATE users SET name = split_part(email, '@', 1) WHERE name IS NULL")
        op.alter_column("users", "name", nullable=False)

    if "is_verified" not in columns:
        op.add_column("users", sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()))
        if "email_verified" in columns:
            op.execute("UPDATE users SET is_verified = email_verified")
        op.alter_column("users", "is_verified", server_default=None)

    if "login_failed_attempts" not in columns:
        op.add_column(
            "users",
            sa.Column("login_failed_attempts", sa.Integer(), nullable=False, server_default="0"),
        )
        op.alter_column("users", "login_failed_attempts", server_default=None)

    if "login_locked_until" not in columns:
        op.add_column("users", sa.Column("login_locked_until", sa.DateTime(timezone=True), nullable=True))

    if "auth_version" not in columns:
        op.add_column("users", sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"))
        op.alter_column("users", "auth_version", server_default=None)

    if "email_verified" in columns:
        op.drop_column("users", "email_verified")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("users")}

    if "email_verified" not in columns:
        op.add_column("users", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()))
        if "is_verified" in columns:
            op.execute("UPDATE users SET email_verified = is_verified")
        op.alter_column("users", "email_verified", server_default=None)

    if "auth_version" in columns:
        op.drop_column("users", "auth_version")
    if "login_locked_until" in columns:
        op.drop_column("users", "login_locked_until")
    if "login_failed_attempts" in columns:
        op.drop_column("users", "login_failed_attempts")
    if "is_verified" in columns:
        op.drop_column("users", "is_verified")
    if "name" in columns:
        op.drop_column("users", "name")

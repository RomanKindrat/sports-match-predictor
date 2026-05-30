"""Make prediction timestamps timezone-aware (UTC)

Revision ID: 7a2b3c4d5e6f
Revises: f0b6e3a9c2d1
Create Date: 2026-04-07 11:10:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7a2b3c4d5e6f"
down_revision: Union[str, Sequence[str], None] = "f0b6e3a9c2d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing values were stored as UTC-naive timestamps.
    # Interpret them as UTC while converting to timestamptz.
    op.alter_column(
        "predictions",
        "created_at",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=False,
        postgresql_using="created_at AT TIME ZONE 'UTC'",
    )

    op.alter_column(
        "predictions",
        "settled_at",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=True,
        postgresql_using="settled_at AT TIME ZONE 'UTC'",
    )


def downgrade() -> None:
    op.alter_column(
        "predictions",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=False,
        postgresql_using="created_at AT TIME ZONE 'UTC'",
    )

    op.alter_column(
        "predictions",
        "settled_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=True,
        postgresql_using="settled_at AT TIME ZONE 'UTC'",
    )


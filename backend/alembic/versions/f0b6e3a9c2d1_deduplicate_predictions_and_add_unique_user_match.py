"""deduplicate predictions and add unique user+match

Revision ID: f0b6e3a9c2d1
Revises: d4f7a1e29a31
Create Date: 2026-03-30 15:40:00
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "f0b6e3a9c2d1"
down_revision: Union[str, Sequence[str], None] = "d4f7a1e29a31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keep only the newest prediction per (user_id, match_id) for authenticated users.
    op.execute(
        """
        WITH ranked AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY user_id, match_id
              ORDER BY created_at DESC NULLS LAST, id DESC
            ) AS rn
          FROM predictions
          WHERE user_id IS NOT NULL
        )
        DELETE FROM predictions p
        USING ranked r
        WHERE p.id = r.id
          AND r.rn > 1;
        """
    )
    op.create_unique_constraint(
        "uq_predictions_user_match",
        "predictions",
        ["user_id", "match_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_predictions_user_match", "predictions", type_="unique")

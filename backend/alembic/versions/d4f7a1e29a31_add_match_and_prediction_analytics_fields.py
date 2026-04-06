"""add match and prediction analytics fields

Revision ID: d4f7a1e29a31
Revises: b9c2f0c0a441
Create Date: 2026-03-29 16:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4f7a1e29a31"
down_revision: Union[str, Sequence[str], None] = "b9c2f0c0a441"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("matches", sa.Column("fixture_id", sa.String(length=40), nullable=True))
    op.add_column("matches", sa.Column("kickoff_tz", sa.String(length=64), nullable=True))
    op.add_column("matches", sa.Column("status", sa.String(length=32), nullable=True))
    op.add_column("matches", sa.Column("venue", sa.String(length=255), nullable=True))
    op.add_column("matches", sa.Column("odds_home", sa.Float(), nullable=True))
    op.add_column("matches", sa.Column("odds_draw", sa.Float(), nullable=True))
    op.add_column("matches", sa.Column("odds_away", sa.Float(), nullable=True))
    op.create_unique_constraint("uq_matches_fixture_id", "matches", ["fixture_id"])

    op.add_column("predictions", sa.Column("value_edge", sa.Float(), nullable=True))
    op.add_column("predictions", sa.Column("bookmaker_p_home", sa.Float(), nullable=True))
    op.add_column("predictions", sa.Column("bookmaker_p_draw", sa.Float(), nullable=True))
    op.add_column("predictions", sa.Column("bookmaker_p_away", sa.Float(), nullable=True))
    op.add_column("predictions", sa.Column("is_correct", sa.Boolean(), nullable=True))
    op.add_column("predictions", sa.Column("settled_at", sa.DateTime(), nullable=True))
    op.add_column("predictions", sa.Column("roi", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("predictions", "roi")
    op.drop_column("predictions", "settled_at")
    op.drop_column("predictions", "is_correct")
    op.drop_column("predictions", "bookmaker_p_away")
    op.drop_column("predictions", "bookmaker_p_draw")
    op.drop_column("predictions", "bookmaker_p_home")
    op.drop_column("predictions", "value_edge")

    op.drop_constraint("uq_matches_fixture_id", "matches", type_="unique")
    op.drop_column("matches", "odds_away")
    op.drop_column("matches", "odds_draw")
    op.drop_column("matches", "odds_home")
    op.drop_column("matches", "venue")
    op.drop_column("matches", "status")
    op.drop_column("matches", "kickoff_tz")
    op.drop_column("matches", "fixture_id")

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from dotenv import load_dotenv

# ---------- ENV ----------
load_dotenv()

# Alembic Config object
config = context.config

# ---------- LOGGING ----------
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------- DATABASE URL ----------
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Put it into backend/.env and restart terminal."
    )

config.set_main_option("sqlalchemy.url", DATABASE_URL)

# ---------- METADATA ----------
# ВАЖЛИВО:
# Base має бути ІМЕННО той самий, що використовують моделі
from app.core.db import Base  # ✅ ЄДИНИЙ Base у проєкті
from app import models        # ✅ РЕЄСТРУЄ всі таблиці (User, Match, etc.)

target_metadata = Base.metadata


# ---------- MIGRATIONS ----------
def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        future=True,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

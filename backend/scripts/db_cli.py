"""CLI entrypoints for database migrate + seed."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from app.database.base import Base
from app.database.seed import seed_all
from app.database.session import get_database_url, get_engine, get_session_factory, reset_engine
from app import models as _models  # noqa: F401 — register metadata


ROOT = Path(__file__).resolve().parents[1]


def init_schema() -> None:
    """Create tables without Alembic (SQLite local, or first-run file DB)."""
    reset_engine()
    engine = get_engine()
    Base.metadata.create_all(engine)
    print(f"Schema ready ({engine.dialect.name}): {get_database_url()}")


def migrate() -> None:
    url = get_database_url()
    if "sqlite" in url:
        init_schema()
        return
    subprocess.check_call(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=ROOT,
    )


def seed() -> None:
    reset_engine()
    session = get_session_factory()()
    try:
        result = seed_all(session)
        print(f"Seed complete: {result}")
    finally:
        session.close()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Maite Trading DB utilities")
    parser.add_argument(
        "command",
        choices=["migrate", "seed", "migrate-and-seed"],
        help="migrate runs Alembic; seed inserts MVP instruments/strategies",
    )
    args = parser.parse_args(argv)

    if args.command == "migrate":
        migrate()
    elif args.command == "seed":
        seed()
    else:
        migrate()
        seed()


if __name__ == "__main__":
    main()

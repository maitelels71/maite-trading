"""CLI entrypoints for database migrate + seed."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from app.database.seed import seed_all
from app.database.session import get_session_factory, reset_engine


ROOT = Path(__file__).resolve().parents[1]


def migrate() -> None:
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

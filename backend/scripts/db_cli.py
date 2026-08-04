#!/usr/bin/env python3
"""CLI helpers for migrate + seed operations."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database.seed import seed_all
from app.database.session import get_engine, session_scope
from app.database.base import Base
import app.models  # noqa: F401


def migrate() -> None:
    subprocess.check_call([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=str(ROOT))


def seed() -> None:
    with session_scope() as session:
        counts = seed_all(session)
        print(f"seeded: {counts}")


def create_all() -> None:
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    print("created tables via metadata.create_all")


def main() -> None:
    parser = argparse.ArgumentParser(description="Maite DB CLI")
    parser.add_argument(
        "command",
        choices=["migrate", "seed", "migrate-and-seed", "create-all"],
    )
    args = parser.parse_args()
    if args.command == "migrate":
        migrate()
    elif args.command == "seed":
        seed()
    elif args.command == "migrate-and-seed":
        migrate()
        seed()
    elif args.command == "create-all":
        create_all()
        seed()


if __name__ == "__main__":
    main()

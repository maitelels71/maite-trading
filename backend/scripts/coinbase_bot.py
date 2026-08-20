"""Coinbase inverse-vol rebalance bot (one pass).

Dry-run by default. Live orders need three gates:
  COINBASE_TRADING_ENABLED=true
  COINBASE_DRY_RUN=false
  --live --confirm-live

Usage (from backend/):

  .\\.venv\\Scripts\\python.exe -m scripts.coinbase_bot
  .\\.venv\\Scripts\\python.exe -m scripts.coinbase_bot --strategy-only
  .\\.venv\\Scripts\\python.exe -m scripts.coinbase_bot --live --confirm-live
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.core.logging import configure_logging, get_logger  # noqa: E402
from app.providers.exceptions import ProviderError, ProviderNotConfiguredError  # noqa: E402
from app.services.coinbase_bot import run_rebalance  # noqa: E402

logger = get_logger(__name__)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    parser = argparse.ArgumentParser(description="Coinbase crypto rebalance bot")
    parser.add_argument(
        "--strategy-only",
        action="store_true",
        help="Print inverse-vol weights from Yahoo; do not call Coinbase",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Place market orders (also requires --confirm-live and env flags)",
    )
    parser.add_argument(
        "--confirm-live",
        action="store_true",
        help="Required extra confirmation for live Coinbase orders",
    )
    args = parser.parse_args(argv)

    try:
        result = run_rebalance(
            live=args.live,
            confirm_live=args.confirm_live,
            strategy_only=args.strategy_only,
        )
    except (ProviderNotConfiguredError, ProviderError) as exc:
        logger.error("%s", exc)
        print(str(exc), file=sys.stderr)
        return 1

    print(json.dumps(asdict(result), indent=2, default=str))
    if result.dry_run and not args.strategy_only:
        print(
            "\nDry run — no orders sent. To trade live: "
            "COINBASE_DRY_RUN=false COINBASE_TRADING_ENABLED=true "
            "and rerun with --live --confirm-live",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Persist Coinbase bot runs for the dashboard (JSON file, gitignored)."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from app.core.config import Settings, settings
from app.services.coinbase_bot import BotRunResult

MAX_RUNS = 100


def resolve_runs_path(config: Settings | None = None) -> Path:
    cfg = config or settings
    path = Path(cfg.coinbase_runs_path)
    if path.is_absolute():
        return path
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / path


def _load(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if isinstance(data, dict) and isinstance(data.get("runs"), list):
        return [row for row in data["runs"] if isinstance(row, dict)]
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    return []


def _save(path: Path, runs: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"runs": runs[-MAX_RUNS:]}, indent=2, default=str),
        encoding="utf-8",
    )


def result_to_record(result: BotRunResult) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "ts": datetime.now(UTC).isoformat(),
        "dry_run": result.dry_run,
        "quote": result.quote,
        "weights": result.weights,
        "holdings": result.holdings,
        "prices": result.prices,
        "orders": result.orders,
        "submissions": result.submissions,
        "error": result.error,
        "portfolio_value": result.portfolio_value,
    }


def append_run(result: BotRunResult, config: Settings | None = None) -> dict[str, Any]:
    path = resolve_runs_path(config)
    runs = _load(path)
    record = result_to_record(result)
    runs.append(record)
    _save(path, runs)
    return record


def list_runs(config: Settings | None = None, *, limit: int = 20) -> list[dict[str, Any]]:
    runs = _load(resolve_runs_path(config))
    runs.reverse()
    return runs[: max(1, min(limit, MAX_RUNS))]


def _dec(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def compute_stats(config: Settings | None = None) -> dict[str, Any]:
    runs = _load(resolve_runs_path(config))
    dry = [r for r in runs if r.get("dry_run")]
    live = [r for r in runs if not r.get("dry_run")]
    last = runs[-1] if runs else None
    live_ok = 0
    live_fail = 0
    for row in live:
        for sub in row.get("submissions") or []:
            if isinstance(sub, dict) and sub.get("success"):
                live_ok += 1
            else:
                live_fail += 1
    planned = Decimal("0")
    for row in runs:
        for order in row.get("orders") or []:
            if isinstance(order, dict):
                planned += _dec(order.get("notional"))
    return {
        "total_runs": len(runs),
        "dry_runs": len(dry),
        "live_runs": len(live),
        "last_run_at": last.get("ts") if last else None,
        "last_dry_run": last.get("dry_run") if last else None,
        "last_portfolio_value": last.get("portfolio_value") if last else None,
        "live_orders_ok": live_ok,
        "live_orders_failed": live_fail,
        "planned_notional_total": str(planned.quantize(Decimal("0.01"))),
    }

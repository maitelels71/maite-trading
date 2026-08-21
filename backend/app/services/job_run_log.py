"""Persist candle-archive job runs (JSON file) when STORAGE_BACKEND=sql."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import Settings, settings

MAX_RUNS = 200


def resolve_job_runs_path(config: Settings | None = None) -> Path:
    cfg = config or settings
    path = Path(cfg.job_runs_path)
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


def append_job_run(record: dict[str, Any], config: Settings | None = None) -> dict[str, Any]:
    path = resolve_job_runs_path(config)
    runs = _load(path)
    runs.append(record)
    _save(path, runs)
    return record


def list_job_runs(
    *,
    job_name: str | None = None,
    limit: int = 30,
    config: Settings | None = None,
) -> list[dict[str, Any]]:
    runs = _load(resolve_job_runs_path(config))
    if job_name:
        runs = [r for r in runs if str(r.get("job_name") or "") == job_name]
    runs.sort(key=lambda r: str(r.get("started_at") or ""), reverse=True)
    return runs[: max(1, min(limit, MAX_RUNS))]


def latest_job_run(job_name: str, config: Settings | None = None) -> dict[str, Any] | None:
    rows = list_job_runs(job_name=job_name, limit=1, config=config)
    return rows[0] if rows else None

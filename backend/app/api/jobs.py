"""Desk Jobs API — candle archive status, history, manual runs."""

from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import boto3
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.storage import using_dynamo
from app.core.desk_auth import require_desk_session
from app.core.logging import get_logger
from app.database.session import get_db
from app.services.archive_store import archive_backend_label, get_archive_store
from app.services.candle_archive import (
    JOB_BACKFILL,
    JOB_EOD,
    run_backfill,
    run_eod_gaps,
    yahoo_max_days,
)

router = APIRouter(prefix="/jobs", tags=["jobs"])
logger = get_logger(__name__)

ET = ZoneInfo("America/New_York")

KNOWN_JOBS = (
    {
        "job_name": JOB_EOD,
        "label": "Candle EOD gaps",
        "schedule": "Every night · 02:15 UTC · ~22:15 ET",
        "schedule_et": "22:15 America/New_York (nightly)",
        "schedule_utc": "02:15 UTC (EventBridge cron 15 2 * * ? *)",
        "schedule_note": "Runs on staging/cheap SAM Lambda after US cash close. Local SQL has no cron — use the button.",
        "timeframes": ["15m", "1h", "4h", "1m"],
    },
    {
        "job_name": JOB_BACKFILL,
        "label": "Candle Yahoo backfill",
        "schedule": "Manual only (no cron)",
        "schedule_et": "— (manual)",
        "schedule_utc": "— (manual)",
        "schedule_note": "One-shot max Yahoo pull (~59d of 15m). Use when seeding or repairing gaps.",
        "timeframes": ["15m", "1h", "4h", "1d"],
    },
)


class BackfillRequest(BaseModel):
    lookback_days: int | None = Field(
        default=None,
        ge=1,
        le=730,
        description="Capped per TF by Yahoo limits (15m ≤ 59).",
    )


def _serialize_run(item: dict[str, Any]) -> dict[str, Any]:
    summary = item.get("summary") if isinstance(item.get("summary"), dict) else {}
    return {
        "job_name": item.get("job_name") or item.get("pk"),
        "started_at": item.get("started_at") or item.get("sk"),
        "finished_at": item.get("finished_at"),
        "status": item.get("status"),
        "trigger": item.get("trigger"),
        "summary": {
            "bars": summary.get("bars", 0),
            "units_ok": summary.get("units_ok", 0),
            "units_err": summary.get("units_err", 0),
        },
        "detail": item.get("detail") or [],
    }


def _store(db: Session):
    return get_archive_store(None if using_dynamo() else db)


def _invoke_archive_async(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Prefer async Lambda invoke (API Gateway ~29s limit). None = run inline."""
    fn = (os.environ.get("CANDLE_ARCHIVE_FUNCTION_NAME") or "").strip()
    if not fn or not using_dynamo():
        return None
    client = boto3.client("lambda")
    client.invoke(
        FunctionName=fn,
        InvocationType="Event",
        Payload=json.dumps(payload).encode("utf-8"),
    )
    logger.info("invoked candle archive async %s", payload.get("mode"))
    return {
        "accepted": True,
        "mode": payload.get("mode"),
        "message": "Archive Lambda started in background — refresh Jobs in ~1–2 min.",
    }


def _run_archive_local_bg(
    *,
    mode: str,
    lookback_days: int | None = None,
) -> dict[str, Any]:
    """Local SQL: don't block the HTTP request (browser 'Failed to fetch' on long Yahoo pulls)."""
    import threading

    def _worker() -> None:
        from app.database.session import get_session_factory

        session = get_session_factory()()
        try:
            store = get_archive_store(session)
            if mode == "backfill":
                run_backfill(
                    lookback_days=lookback_days,
                    trigger="manual",
                    store=store,
                )
            else:
                run_eod_gaps(trigger="manual", store=store)
        except Exception:
            logger.exception("local candle archive background failed mode=%s", mode)
        finally:
            session.close()

    threading.Thread(target=_worker, name=f"candle-archive-{mode}", daemon=True).start()
    return {
        "accepted": True,
        "mode": mode,
        "message": (
            "Archive started in background on this API — refresh Jobs in 1–3 min "
            "(Yahoo can take a while)."
        ),
    }


@router.get("/status")
def jobs_status(
    _: dict = Depends(require_desk_session),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    store = _store(db)
    now_et = datetime.now(ET)
    backend = archive_backend_label()
    jobs: list[dict[str, Any]] = []
    for meta in KNOWN_JOBS:
        latest = store.latest_job_run(str(meta["job_name"]))
        jobs.append(
            {
                **meta,
                "latest": _serialize_run(latest) if latest else None,
                "yahoo_caps": {
                    tf: yahoo_max_days(tf) for tf in meta["timeframes"]
                },
            }
        )
    note = (
        "Yahoo 15m ≈ 59 days max per pull; archive grows each EOD. "
        "1m stays short (~7d) + daily gap."
    )
    if backend != "dynamodb":
        note += (
            " Local SQL mode: runs go to .secrets/job_runs.json. "
            "Staging/cheap SAM uses Dynamo + nightly Lambda."
        )
    return {
        "now_et": now_et.isoformat(),
        "backend": backend,
        "note": note,
        "jobs": jobs,
    }


@router.get("/runs")
def jobs_runs(
    limit: int = Query(30, ge=1, le=100),
    job_name: str | None = Query(None),
    _: dict = Depends(require_desk_session),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    store = _store(db)
    rows = store.list_job_runs(job_name=job_name, limit=limit)
    return {"items": [_serialize_run(r) for r in rows], "backend": archive_backend_label()}


@router.post("/candle-archive/eod")
def jobs_run_eod(
    _: dict = Depends(require_desk_session),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    async_started = _invoke_archive_async({"mode": "eod", "trigger": "manual"})
    if async_started:
        return async_started
    # Local: avoid long-blocking request (browser Failed to fetch).
    _ = db  # session dependency still opens/closes for auth path consistency
    return _run_archive_local_bg(mode="eod")


@router.post("/candle-archive/backfill")
def jobs_run_backfill(
    body: BackfillRequest | None = None,
    _: dict = Depends(require_desk_session),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    lookback = body.lookback_days if body else None
    async_started = _invoke_archive_async(
        {
            "mode": "backfill",
            "trigger": "manual",
            "lookback_days": lookback,
        }
    )
    if async_started:
        return async_started
    _ = db
    return _run_archive_local_bg(mode="backfill", lookback_days=lookback)

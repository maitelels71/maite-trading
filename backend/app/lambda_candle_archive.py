"""EventBridge entrypoint — nightly candle archive gaps into Dynamo."""

from __future__ import annotations

import json
import os

from app.core.secrets_loader import load_app_secrets_into_env

load_app_secrets_into_env()

from app.core.config import get_settings
import app.core.config as config_mod

get_settings.cache_clear()
config_mod.settings = get_settings()

from app.core.logging import get_logger
from app.services.candle_archive import run_backfill, run_eod_gaps

logger = get_logger(__name__)


def handler(event: dict, context: object) -> dict:
    """
    AWS Lambda handler.
    EventBridge schedule → EOD gaps.
    Manual invoke: {"mode":"eod"|"backfill","trigger":"manual","lookback_days":59}
    """
    _ = context, os.environ.get("ENVIRONMENT")
    event = event or {}
    mode = str(event.get("mode") or "eod").strip().lower()
    trigger = str(event.get("trigger") or "schedule")
    if trigger not in ("schedule", "manual"):
        trigger = "schedule"

    if mode == "backfill":
        lookback = event.get("lookback_days")
        lookback_i = int(lookback) if lookback is not None else None
        result = run_backfill(lookback_days=lookback_i, trigger=trigger)  # type: ignore[arg-type]
    else:
        result = run_eod_gaps(trigger=trigger)  # type: ignore[arg-type]

    payload = result.to_record()
    logger.info("candle archive %s %s", mode, json.dumps(payload, default=str))
    return payload

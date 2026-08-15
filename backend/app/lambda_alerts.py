"""EventBridge entrypoint — scan playbooks and SMS ready-to-enter setups."""

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
from app.services.signal_alert_service import run_signal_alerts

logger = get_logger(__name__)


def handler(event: dict, context: object) -> dict:
    """AWS Lambda handler (EventBridge schedule)."""
    _ = event, context, os.environ.get("ENVIRONMENT")
    result = run_signal_alerts(sync=True)
    logger.info("signal alerts tick %s", json.dumps(result, default=str))
    return result

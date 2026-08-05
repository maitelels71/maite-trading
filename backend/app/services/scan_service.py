"""Shared market scan runner used by Scanner and Premarket."""

from __future__ import annotations

from typing import Any

from app.api.strategy import execute_scan
from app.schemas.strategy_api import StrategyScanRequest, StrategyScanResponse


def run_scan(body: StrategyScanRequest, *, db: Any = None) -> StrategyScanResponse:
    return execute_scan(body, db=db)

"""Premarket evaluate schemas (OceanView-inspired)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.strategy_api import StrategyScanHit


class PremarketStartRequest(BaseModel):
    session_date: date | None = None
    timeframe: str = "5m"
    data_provider: str | None = None
    strategies: list[str] = Field(default_factory=list)
    symbols: list[str] | None = None


class PremarketStrategyGroup(BaseModel):
    strategy: str
    match_count: int
    total: int
    tickers: list[StrategyScanHit]


class PremarketResultResponse(BaseModel):
    run_id: str
    status: str = "completed"
    started_at: datetime
    finished_at: datetime
    session_date: date
    timeframe: str
    strategies_requested: list[str]
    data_provider: str | None = None
    summary: dict[str, int]
    strategy_groups: list[PremarketStrategyGroup]
    best_results: list[StrategyScanHit]
    hits: list[StrategyScanHit]

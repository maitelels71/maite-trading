"""Shared API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class HealthResponse(BaseModel):
    status: str = "ok"
    app: str
    env: str


class InstrumentOut(ORMModel):
    id: int
    symbol: str
    name: str
    asset_class: str
    provider: str
    exchange: str
    currency: str
    tick_size: str
    contract_multiplier: str
    is_active: bool


class StrategyOut(BaseModel):
    id: str
    name: str
    description: str


class MarketDataSyncRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=32)
    timeframe: str = "1m"
    start: datetime
    end: datetime
    force_refresh: bool = False


class MarketDataSyncResponse(BaseModel):
    symbol: str
    provider: str
    timeframe: str
    fetched: int
    upserted: int
    cached: int
    source: str


class ErrorResponse(BaseModel):
    detail: str
    extra: Optional[dict[str, Any]] = None

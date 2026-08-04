"""API request/response schemas for strategy + market data endpoints."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import InstrumentOut, SignalOut, StrategyOut, TradeOut


class MarketDataSyncRequest(BaseModel):
    ticker: str
    timeframe: str = "5m"
    start: datetime
    end: datetime
    market_type: str | None = None
    force_refresh: bool = False


class MarketDataSyncResponse(BaseModel):
    ticker: str
    timeframe: str
    candles_count: int


class StrategyEvaluateRequest(BaseModel):
    ticker: str
    strategy: str = "opening_range_breakout"
    timeframe: str = "5m"
    date: date
    market_type: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)


class StrategyBacktestRequest(BaseModel):
    ticker: str
    strategy: str = "opening_range_breakout"
    timeframe: str = "5m"
    start_date: date
    end_date: date
    market_type: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    persist: bool = True


class MetricsOut(BaseModel):
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    profit_loss: Decimal
    max_drawdown: Decimal


class StrategyEvaluateResponse(BaseModel):
    ticker: str
    strategy: str
    timeframe: str
    date: date
    metrics: MetricsOut
    signals: list[SignalOut]
    trades: list[TradeOut]


class StrategyBacktestResponse(BaseModel):
    run_id: UUID | None = None
    ticker: str
    strategy: str
    timeframe: str
    start_date: date
    end_date: date
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    profit_loss: Decimal
    max_drawdown: Decimal
    trades: list[TradeOut]
    signals: list[SignalOut] = Field(default_factory=list)


class InstrumentListResponse(BaseModel):
    items: list[InstrumentOut]


class StrategyListResponse(BaseModel):
    items: list[StrategyOut]

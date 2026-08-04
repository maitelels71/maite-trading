"""Strategy evaluate / backtest API schemas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class StrategyParamsIn(BaseModel):
    opening_range_minutes: int = Field(default=5, gt=0)
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    allow_long: bool = True
    allow_short: bool = True
    flatten_at_session_end: bool = True


class CandleIn(BaseModel):
    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal = Decimal("0")
    timeframe: str = "1m"


class EvaluateRequest(BaseModel):
    strategy_id: str = "opening_range_breakout"
    symbol: str
    candles: List[CandleIn]
    params: Optional[StrategyParamsIn] = None


class SignalOut(BaseModel):
    timestamp: datetime
    signal_type: str
    side: str
    price: str
    reason: str = ""


class TradeOut(BaseModel):
    side: str
    quantity: str
    entry_price: str
    entry_time: datetime
    exit_price: Optional[str] = None
    exit_time: Optional[datetime] = None
    pnl: Optional[str] = None
    status: str


class EvaluateResponse(BaseModel):
    strategy_id: str
    symbol: str
    signals: List[SignalOut]
    trades: List[TradeOut]
    total_pnl: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class BacktestRequest(BaseModel):
    strategy_id: str = "opening_range_breakout"
    symbol: str
    timeframe: str = "1m"
    start: datetime
    end: datetime
    params: Optional[StrategyParamsIn] = None
    sync_first: bool = True


class BacktestResponse(BaseModel):
    backtest_run_id: int
    status: str
    symbol: str
    strategy_id: str
    total_trades: int
    total_pnl: str
    signals: List[SignalOut]
    trades: List[TradeOut]
    summary: dict[str, Any] = Field(default_factory=dict)

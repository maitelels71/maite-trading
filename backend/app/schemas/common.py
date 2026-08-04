"""Shared API schema primitives (full request/response models in Prompt 8)."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import DataProviderName, MarketType, Side, Timeframe


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class InstrumentOut(OrmModel):
    symbol: str
    name: str = ""
    market_type: MarketType
    data_provider: DataProviderName
    active: bool = True


class StrategyOut(BaseModel):
    name: str
    description: str
    default_parameters: dict = Field(default_factory=dict)


class CandleOut(BaseModel):
    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    ticker: str
    timeframe: Timeframe | str


class SignalOut(BaseModel):
    timestamp: datetime
    side: Side
    price: Decimal
    reason: str
    ticker: str = ""


class TradeOut(BaseModel):
    side: Side
    entry_time: datetime
    entry_price: Decimal
    signal: str
    exit_time: datetime | None = None
    exit_price: Decimal | None = None
    profit_loss: Decimal | None = None
    notes: str | None = None

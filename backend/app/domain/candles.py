"""Normalized market candle — broker-agnostic."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from app.domain.enums import Timeframe


@dataclass(frozen=True, slots=True)
class Candle:
    """OHLCV bar used by strategies and persistence."""

    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    ticker: str
    timeframe: Timeframe | str

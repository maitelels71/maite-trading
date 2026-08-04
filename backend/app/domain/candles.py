"""Candle domain objects."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Iterable, List, Sequence


@dataclass(frozen=True, slots=True)
class Candle:
    symbol: str
    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    timeframe: str = "1m"

    def __post_init__(self) -> None:
        if self.high < self.low:
            raise ValueError("high must be >= low")
        if self.high < max(self.open, self.close) or self.low > min(self.open, self.close):
            raise ValueError("OHLC relationship invalid")


def sort_candles(candles: Iterable[Candle]) -> List[Candle]:
    return sorted(candles, key=lambda c: c.timestamp)


def ensure_monotonic(candles: Sequence[Candle]) -> None:
    previous = None
    for candle in candles:
        if previous is not None and candle.timestamp <= previous.timestamp:
            raise ValueError("candles must be strictly increasing by timestamp")
        previous = candle

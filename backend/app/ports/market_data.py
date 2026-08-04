"""Market data provider port."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional, Sequence

from app.domain.candles import Candle


class MarketDataProvider(ABC):
    """Port for retrieving historical / intraday candles."""

    name: str

    @abstractmethod
    def get_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> List[Candle]:
        raise NotImplementedError

    def supports(self, symbol: str) -> bool:
        return True

    def healthcheck(self) -> bool:
        return True


class MarketDataRepository(ABC):
    """Port for persisting candles."""

    @abstractmethod
    def upsert_candles(self, instrument_id: int, candles: Sequence[Candle]) -> int:
        raise NotImplementedError

    @abstractmethod
    def get_candles(
        self,
        instrument_id: int,
        timeframe: str,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> List[Candle]:
        raise NotImplementedError

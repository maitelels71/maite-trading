"""Deterministic mock market-data provider for local/dev/tests."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import List
from zoneinfo import ZoneInfo

from app.core.constants import PROVIDER_MOCK
from app.domain.candles import Candle
from app.ports.market_data import MarketDataProvider


class MockMarketDataProvider(MarketDataProvider):
    name = PROVIDER_MOCK

    def __init__(self, base_price: Decimal = Decimal("100")) -> None:
        self.base_price = base_price

    def get_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> List[Candle]:
        if end <= start:
            return []

        tz = ZoneInfo("America/New_York")
        # Align to session open if possible for nicer ORB demos
        cursor = start.astimezone(tz).replace(second=0, microsecond=0)
        end_local = end.astimezone(tz)
        candles: List[Candle] = []
        i = 0
        price = self.base_price
        while cursor <= end_local:
            # Mild deterministic walk so ORB can break out
            drift = Decimal("0.15") * Decimal(str((i % 17) - 8))
            open_ = price
            close = price + drift
            high = max(open_, close) + Decimal("0.05")
            low = min(open_, close) - Decimal("0.05")
            candles.append(
                Candle(
                    symbol=symbol,
                    timestamp=cursor,
                    open=open_,
                    high=high,
                    low=low,
                    close=close,
                    volume=Decimal("1000") + Decimal(i),
                    timeframe=timeframe,
                )
            )
            price = close
            cursor += timedelta(minutes=1)
            i += 1
            if i > 20_000:
                break
        return candles

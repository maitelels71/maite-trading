"""In-memory / fixture market data provider for local tests."""

from __future__ import annotations

from datetime import datetime

from app.domain.candles import Candle
from app.domain.enums import DataProviderName
from app.providers.normalize import normalize_candles


class MockMarketDataProvider:
    """MarketDataProvider that returns preloaded candle dicts — no network."""

    def __init__(
        self,
        candles_by_symbol: dict[str, list[dict]] | None = None,
        *,
        name: DataProviderName = DataProviderName.SCHWAB,
    ) -> None:
        self._raw = candles_by_symbol or {}
        self._name = name
        self._authenticated = False

    @property
    def name(self) -> DataProviderName:
        return self._name

    def authenticate(self) -> None:
        self._authenticated = True

    def ensure_authenticated(self) -> None:
        if not self._authenticated:
            self.authenticate()

    def get_historical_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> list[Candle]:
        self.ensure_authenticated()
        raw = self._raw.get(symbol, [])
        candles = normalize_candles(raw, ticker=symbol, timeframe=timeframe)
        return [c for c in candles if start <= c.timestamp <= end]

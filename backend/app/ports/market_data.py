"""Market data provider port — implemented by Schwab and TradeAdvocate adapters."""

from datetime import datetime
from typing import Protocol, runtime_checkable

from app.domain.candles import Candle
from app.domain.enums import DataProviderName


@runtime_checkable
class MarketDataProvider(Protocol):
    """Fetch and normalize historical candles from an external broker/data API."""

    @property
    def name(self) -> DataProviderName:
        """Stable provider identifier used for routing."""

    def authenticate(self) -> None:
        """Ensure credentials/tokens are valid. Raise on auth failure."""

    def ensure_authenticated(self) -> None:
        """Authenticate only when required (cached session/token)."""

    def get_historical_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> list[Candle]:
        """
        Return broker-agnostic candles for [start, end].

        Implementations must normalize vendor payloads to domain.Candle.
        """

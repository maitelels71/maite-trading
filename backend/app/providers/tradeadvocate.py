"""Futures market data for the futures desk (analysis via Schwab)."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from app.core.config import Settings, settings
from app.core.logging import get_logger
from app.domain.candles import Candle
from app.domain.enums import DataProviderName
from app.providers.schwab import SchwabProvider

logger = get_logger(__name__)

# Longest roots first so MNQ does not collapse to NQ.
_SCHWAB_FUTURES_ROOTS: tuple[str, ...] = (
    "MNQ",
    "MES",
    "MGC",
    "MYM",
    "MCL",
    "M2K",
    "NQ",
    "ES",
    "GC",
    "YM",
    "CL",
    "RTY",
    "6E",
)


def schwab_futures_symbol(symbol: str) -> str:
    """Map desk roots / contract codes to Schwab continuous futures symbols."""
    raw = symbol.strip().upper()
    if raw.startswith("/"):
        raw = raw[1:]
    for root in _SCHWAB_FUTURES_ROOTS:
        if raw == root or raw.startswith(root):
            return f"/{root}"
    return f"/{raw}" if raw else symbol


class TradeAdvocateProvider:
    """Futures desk provider. Pulls candles from Schwab; no Tradovate API."""

    def __init__(
        self,
        config: Settings | None = None,
        *,
        schwab: SchwabProvider | None = None,
    ) -> None:
        self._config = config or settings
        self._schwab = schwab or SchwabProvider(self._config)

    @property
    def name(self) -> DataProviderName:
        return DataProviderName.TRADEADVOCATE

    def authenticate(self) -> None:
        self._schwab.authenticate()
        logger.info("TradeAdvocateProvider authenticated via Schwab")

    def ensure_authenticated(self) -> None:
        self._schwab.ensure_authenticated()

    def get_historical_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> list[Candle]:
        api_symbol = schwab_futures_symbol(symbol)
        logger.info(
            "futures_candles symbol=%s schwab=%s tf=%s",
            symbol,
            api_symbol,
            timeframe,
        )
        candles = self._schwab.get_historical_candles(
            api_symbol, timeframe, start, end
        )
        if api_symbol == symbol:
            return candles
        return [replace(c, ticker=symbol) for c in candles]

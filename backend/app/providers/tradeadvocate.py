"""Futures market data for the futures desk (analysis via Yahoo Finance)."""

from __future__ import annotations

from datetime import datetime

from app.core.config import Settings, settings
from app.core.logging import get_logger
from app.domain.candles import Candle
from app.domain.enums import DataProviderName
from app.providers.yahoo import YahooProvider

logger = get_logger(__name__)


class TradeAdvocateProvider:
    """Futures desk provider. Pulls candles from Yahoo; no Tradovate API."""

    def __init__(
        self,
        config: Settings | None = None,
        *,
        yahoo: YahooProvider | None = None,
    ) -> None:
        self._config = config or settings
        self._yahoo = yahoo or YahooProvider(self._config)

    @property
    def name(self) -> DataProviderName:
        return DataProviderName.TRADEADVOCATE

    def authenticate(self) -> None:
        self._yahoo.authenticate()
        logger.info("TradeAdvocateProvider ready (Yahoo Finance, no auth)")

    def ensure_authenticated(self) -> None:
        self._yahoo.ensure_authenticated()

    def get_historical_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> list[Candle]:
        return self._yahoo.get_historical_candles(
            symbol,
            timeframe,
            start,
            end,
            desk_ticker=symbol,
        )

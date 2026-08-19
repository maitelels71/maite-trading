"""Charles Schwab market data adapter (stocks / ETFs)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from app.core.config import Settings, settings
from app.core.logging import get_logger
from app.domain.candles import Candle
from app.domain.enums import DataProviderName
from app.providers.exceptions import ProviderNotConfiguredError
from app.providers.schwab_oauth import get_valid_access_token
from app.providers.yahoo import YahooProvider

logger = get_logger(__name__)

# Schwab market data base (price history). Exact paths may require account-specific APIs.
SCHWAB_API_BASE = "https://api.schwabapi.com/marketdata/v1"


class SchwabProvider:
    """MarketDataProvider implementation for Charles Schwab equities/ETFs."""

    def __init__(
        self,
        config: Settings | None = None,
        *,
        client: httpx.Client | None = None,
        access_token: str | None = None,
        yahoo: YahooProvider | None = None,
    ) -> None:
        self._config = config or settings
        self._client = client
        self._access_token = access_token
        self._injected_token = access_token is not None
        self._authenticated = access_token is not None
        self._yahoo = yahoo

    @property
    def name(self) -> DataProviderName:
        return DataProviderName.SCHWAB

    def authenticate(self) -> None:
        if self._injected_token:
            self._authenticated = True
            return
        if not self._config.schwab_client_id or not self._config.schwab_client_secret:
            raise ProviderNotConfiguredError(
                "SCHWAB_CLIENT_ID and SCHWAB_CLIENT_SECRET must be set"
            )
        token = get_valid_access_token(self._config)
        if token != self._access_token:
            self._access_token = token
            self._reset_client()
        self._authenticated = True

    def ensure_authenticated(self) -> None:
        if self._injected_token:
            self._authenticated = True
            return
        self.authenticate()

    def _reset_client(self) -> None:
        if self._client is not None and not self._injected_token:
            self._client.close()
            self._client = None

    def _get_client(self) -> httpx.Client:
        if self._client is not None:
            return self._client
        if not self._access_token:
            self.authenticate()
        self._client = httpx.Client(
            base_url=SCHWAB_API_BASE,
            timeout=20.0,
            headers={"Authorization": f"Bearer {self._access_token}"},
        )
        return self._client

    def get_historical_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> list[Candle]:
        """Options TOP 5 candles from Yahoo so Schwab quota is free for orders."""
        yahoo = self._yahoo or YahooProvider(self._config)
        return yahoo.get_historical_candles(
            symbol,
            timeframe,
            start,
            end,
            desk_ticker=symbol,
            as_futures=False,
        )


def _schwab_frequency_params(timeframe: str) -> tuple[str, int]:
    mapping: dict[str, tuple[str, int]] = {
        "1m": ("minute", 1),
        "5m": ("minute", 5),
        "15m": ("minute", 15),
        "30m": ("minute", 30),
        # Native 60m unsupported; callers should aggregate 30m (see get_historical_candles).
        "1h": ("minute", 30),
        "4h": ("daily", 1),
        "1d": ("daily", 1),
        "Daily": ("daily", 1),
    }
    return mapping.get(timeframe, ("minute", 5))


def _schwab_period_type(frequency_type: str) -> str:
    if frequency_type == "minute":
        return "day"
    # daily/weekly/monthly: use year so startDate/endDate lookbacks fit.
    return "year"


def _extract_schwab_candles(payload: dict[str, Any]) -> list[dict[str, Any]]:
    candles = payload.get("candles") or payload.get("Candles") or []
    rows: list[dict[str, Any]] = []
    for c in candles:
        rows.append(
            {
                "timestamp": c.get("datetime") or c.get("time") or c.get("timestamp"),
                "open": c["open"],
                "high": c["high"],
                "low": c["low"],
                "close": c["close"],
                "volume": c.get("volume", 0),
            }
        )
    return rows

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
from app.providers.http_utils import raise_for_provider_response
from app.providers.normalize import normalize_candles

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
    ) -> None:
        self._config = config or settings
        self._client = client
        self._access_token = access_token
        self._authenticated = access_token is not None

    @property
    def name(self) -> DataProviderName:
        return DataProviderName.SCHWAB

    def authenticate(self) -> None:
        if not self._config.schwab_client_id or not self._config.schwab_client_secret:
            raise ProviderNotConfiguredError(
                "SCHWAB_CLIENT_ID and SCHWAB_CLIENT_SECRET must be set"
            )
        if self._access_token:
            self._authenticated = True
            return
        # Full OAuth2 authorization-code + refresh flow is environment-specific.
        # For now require a bearer token via access_token ctor arg or future token store.
        raise ProviderNotConfiguredError(
            "Schwab OAuth token not available. Complete OAuth once and supply "
            "access_token / SCHWAB_TOKEN_PATH refresh handling before live calls."
        )

    def ensure_authenticated(self) -> None:
        if not self._authenticated:
            self.authenticate()

    def _get_client(self) -> httpx.Client:
        if self._client is not None:
            return self._client
        self._client = httpx.Client(
            base_url=SCHWAB_API_BASE,
            timeout=30.0,
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
        self.ensure_authenticated()
        params = {
            "symbol": symbol,
            "periodType": "day",
            "frequencyType": _schwab_frequency(timeframe),
            "startDate": int(start.timestamp() * 1000),
            "endDate": int(end.timestamp() * 1000),
            "needExtendedHoursData": "false",
        }
        client = self._get_client()
        response = client.get(f"/pricehistory", params=params)
        raise_for_provider_response(response, provider="schwab")
        payload = response.json()
        rows = _extract_schwab_candles(payload)
        return normalize_candles(rows, ticker=symbol, timeframe=timeframe)


def _schwab_frequency(timeframe: str) -> str:
    mapping = {
        "1m": "minute",
        "5m": "minute",
        "15m": "minute",
        "30m": "minute",
        "1h": "minute",
        "4h": "daily",
        "1d": "daily",
        "Daily": "daily",
    }
    return mapping.get(timeframe, "minute")


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

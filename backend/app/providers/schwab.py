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
from app.providers.schwab_oauth import get_valid_access_token

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
        self._access_token = get_valid_access_token(self._config)
        self._authenticated = True
        # Reset client so Authorization header picks up fresh token
        if self._client is not None:
            self._client.close()
            self._client = None

    def ensure_authenticated(self) -> None:
        if not self._authenticated:
            self.authenticate()

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
        self.ensure_authenticated()
        # Schwab has no native 60m bar — fetch 30m and aggregate to 1h.
        fetch_tf = "30m" if timeframe == "1h" else timeframe
        freq_type, frequency = _schwab_frequency_params(fetch_tf)
        params: dict[str, Any] = {
            "symbol": symbol,
            "periodType": "day",
            "frequencyType": freq_type,
            "frequency": frequency,
            "startDate": int(start.timestamp() * 1000),
            "endDate": int(end.timestamp() * 1000),
            "needExtendedHoursData": "false",
        }
        client = self._get_client()
        response = client.get("/pricehistory", params=params)
        raise_for_provider_response(response, provider="schwab")
        payload = response.json()
        rows = _extract_schwab_candles(payload)
        candles = normalize_candles(rows, ticker=symbol, timeframe=fetch_tf)
        if timeframe == "1h":
            from app.indicators.aggregate import aggregate_candles

            return aggregate_candles(
                candles, bucket_minutes=60, out_timeframe="1h"
            )
        return candles


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

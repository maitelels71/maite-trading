"""TradeAdvocate market data adapter (futures)."""

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


class TradeAdvocateProvider:
    """MarketDataProvider implementation for TradeAdvocate futures data."""

    def __init__(
        self,
        config: Settings | None = None,
        *,
        client: httpx.Client | None = None,
    ) -> None:
        self._config = config or settings
        self._client = client
        self._authenticated = False
        self._token: str | None = None

    @property
    def name(self) -> DataProviderName:
        return DataProviderName.TRADEADVOCATE

    def authenticate(self) -> None:
        if not self._config.tradeadvocate_api_key:
            raise ProviderNotConfiguredError(
                "TRADEADVOCATE_API_KEY must be set (and related TradeAdvocate credentials)"
            )
        if not self._config.tradeadvocate_base_url and self._client is None:
            raise ProviderNotConfiguredError(
                "TRADEADVOCATE_BASE_URL must be set for live TradeAdvocate calls"
            )
        # Placeholder auth: many brokers use API key header; adjust when API docs are wired.
        self._token = self._config.tradeadvocate_api_key
        self._authenticated = True
        logger.info("TradeAdvocateProvider authenticated (API key mode)")

    def ensure_authenticated(self) -> None:
        if not self._authenticated:
            self.authenticate()

    def _get_client(self) -> httpx.Client:
        if self._client is not None:
            return self._client
        headers = {
            "Authorization": f"Bearer {self._token}",
            "X-API-KEY": self._config.tradeadvocate_api_key,
        }
        if self._config.tradeadvocate_api_secret:
            headers["X-API-SECRET"] = self._config.tradeadvocate_api_secret
        self._client = httpx.Client(
            base_url=self._config.tradeadvocate_base_url.rstrip("/"),
            timeout=30.0,
            headers=headers,
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
        # Endpoint path is adapter-local; update when TradeAdvocate OpenAPI is confirmed.
        params = {
            "symbol": symbol,
            "timeframe": timeframe,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "account_id": self._config.tradeadvocate_account_id or None,
        }
        params = {k: v for k, v in params.items() if v is not None}
        client = self._get_client()
        response = client.get("/v1/marketdata/candles", params=params)
        raise_for_provider_response(response, provider="tradeadvocate")
        payload = response.json()
        rows = _extract_tradeadvocate_candles(payload)
        return normalize_candles(rows, ticker=symbol, timeframe=timeframe)


def _extract_tradeadvocate_candles(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        candles = payload
    else:
        candles = payload.get("candles") or payload.get("data") or []
    rows: list[dict[str, Any]] = []
    for c in candles:
        rows.append(
            {
                "timestamp": c.get("timestamp") or c.get("time") or c.get("t"),
                "open": c.get("open", c.get("o")),
                "high": c.get("high", c.get("h")),
                "low": c.get("low", c.get("l")),
                "close": c.get("close", c.get("c")),
                "volume": c.get("volume", c.get("v", 0)),
            }
        )
    return rows

"""Charles Schwab market-data provider (stocks/ETFs)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

import httpx

from app.core.config import Settings, get_settings
from app.core.constants import PROVIDER_SCHWAB
from app.domain.candles import Candle
from app.ports.market_data import MarketDataProvider
from app.providers.exceptions import ProviderAuthError
from app.providers.http_utils import build_client, get_json
from app.providers.normalize import normalize_candles


class SchwabMarketDataProvider(MarketDataProvider):
    name = PROVIDER_SCHWAB

    def __init__(
        self,
        settings: Optional[Settings] = None,
        client: Optional[httpx.Client] = None,
        access_token: Optional[str] = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._access_token = access_token or ""
        self._owns_client = client is None
        self.client = client or build_client(self.settings.schwab_api_base_url)

    def _ensure_auth(self) -> None:
        if self._access_token:
            return
        if not (
            self.settings.schwab_client_id
            and self.settings.schwab_client_secret
            and self.settings.schwab_refresh_token
        ):
            raise ProviderAuthError("Schwab credentials are not configured")
        # Placeholder OAuth refresh — real tokens required in non-mock mode
        payload = {
            "grant_type": "refresh_token",
            "refresh_token": self.settings.schwab_refresh_token,
        }
        response = self.client.post(
            "/v1/oauth/token",
            data=payload,
            auth=(self.settings.schwab_client_id, self.settings.schwab_client_secret),
        )
        if response.status_code >= 400:
            raise ProviderAuthError(f"Schwab token refresh failed: {response.status_code}")
        data = response.json()
        self._access_token = data.get("access_token", "")
        if not self._access_token:
            raise ProviderAuthError("Schwab token response missing access_token")

    def get_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> List[Candle]:
        self._ensure_auth()
        params = {
            "symbol": symbol,
            "periodType": "day",
            "frequencyType": "minute",
            "frequency": 1 if timeframe.endswith("m") else 1,
            "startDate": int(start.timestamp() * 1000),
            "endDate": int(end.timestamp() * 1000),
            "needExtendedHoursData": "false",
        }
        headers = {"Authorization": f"Bearer {self._access_token}"}
        data: Any = get_json(
            self.client,
            "/marketdata/v1/pricehistory",
            params=params,
            headers=headers,
            provider=self.name,
        )
        candles_raw = data.get("candles") or data.get("data") or []
        return normalize_candles(candles_raw, symbol=symbol, timeframe=timeframe)

    def close(self) -> None:
        if self._owns_client:
            self.client.close()

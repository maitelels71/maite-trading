"""TradeAdvocate market-data provider (futures)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

import httpx

from app.core.config import Settings, get_settings
from app.core.constants import PROVIDER_TRADEADVOCATE
from app.domain.candles import Candle
from app.ports.market_data import MarketDataProvider
from app.providers.exceptions import ProviderAuthError
from app.providers.http_utils import build_client, get_json
from app.providers.normalize import normalize_candles


class TradeAdvocateMarketDataProvider(MarketDataProvider):
    name = PROVIDER_TRADEADVOCATE

    def __init__(
        self,
        settings: Optional[Settings] = None,
        client: Optional[httpx.Client] = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._owns_client = client is None
        headers = {}
        if self.settings.tradeadvocate_api_key:
            headers["Authorization"] = f"Bearer {self.settings.tradeadvocate_api_key}"
            headers["X-API-Key"] = self.settings.tradeadvocate_api_key
        self.client = client or build_client(
            self.settings.tradeadvocate_api_base_url,
            headers=headers,
        )

    def get_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> List[Candle]:
        if not self.settings.tradeadvocate_api_key and "Authorization" not in self.client.headers:
            raise ProviderAuthError("TradeAdvocate API key is not configured")
        params = {
            "symbol": symbol,
            "timeframe": timeframe,
            "start": start.isoformat(),
            "end": end.isoformat(),
        }
        data: Any = get_json(
            self.client,
            "/v1/marketdata/candles",
            params=params,
            provider=self.name,
        )
        candles_raw = data.get("candles") or data.get("data") or data.get("bars") or []
        return normalize_candles(candles_raw, symbol=symbol, timeframe=timeframe)

    def close(self) -> None:
        if self._owns_client:
            self.client.close()

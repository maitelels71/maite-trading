"""Provider factory — routes by asset class / explicit provider name."""

from __future__ import annotations

from typing import Dict, Optional

from app.core.config import Settings, get_settings
from app.core.constants import PROVIDER_MOCK, PROVIDER_SCHWAB, PROVIDER_TRADEADVOCATE
from app.domain.enums import AssetClass, ProviderName
from app.ports.market_data import MarketDataProvider
from app.providers.mock import MockMarketDataProvider
from app.providers.schwab import SchwabMarketDataProvider
from app.providers.tradeadvocate import TradeAdvocateMarketDataProvider


class ProviderFactory:
    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self._cache: Dict[str, MarketDataProvider] = {}

    def get(self, provider_name: str) -> MarketDataProvider:
        key = provider_name.lower()
        if key in self._cache:
            return self._cache[key]

        if self.settings.use_mock_providers or key == PROVIDER_MOCK:
            provider: MarketDataProvider = MockMarketDataProvider()
            # Still key by requested name so callers get a stable handle
            self._cache[key] = provider
            return provider

        if key == PROVIDER_SCHWAB:
            provider = SchwabMarketDataProvider(settings=self.settings)
        elif key == PROVIDER_TRADEADVOCATE:
            provider = TradeAdvocateMarketDataProvider(settings=self.settings)
        else:
            raise ValueError(f"unknown provider: {provider_name}")

        self._cache[key] = provider
        return provider

    def for_asset_class(self, asset_class: AssetClass | str) -> MarketDataProvider:
        if isinstance(asset_class, str):
            asset_class = AssetClass(asset_class)
        if asset_class == AssetClass.FUTURE:
            return self.get(PROVIDER_TRADEADVOCATE)
        return self.get(PROVIDER_SCHWAB)

    def for_provider_enum(self, provider: ProviderName) -> MarketDataProvider:
        return self.get(provider.value)


def get_provider_factory(settings: Optional[Settings] = None) -> ProviderFactory:
    return ProviderFactory(settings=settings)

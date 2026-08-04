"""Market data provider adapters (Schwab, TradeAdvocate)."""

from app.providers.exceptions import (
    ProviderAuthError,
    ProviderError,
    ProviderNotConfiguredError,
    ProviderRateLimitError,
)
from app.providers.factory import ProviderFactory, get_provider_factory
from app.providers.mock import MockMarketDataProvider
from app.providers.normalize import normalize_candle, normalize_candles
from app.providers.schwab import SchwabProvider
from app.providers.tradeadvocate import TradeAdvocateProvider
from app.providers.tradeadvocate_broker import TradeAdvocateBroker

__all__ = [
    "MockMarketDataProvider",
    "ProviderAuthError",
    "ProviderError",
    "ProviderFactory",
    "ProviderNotConfiguredError",
    "ProviderRateLimitError",
    "SchwabProvider",
    "TradeAdvocateBroker",
    "TradeAdvocateProvider",
    "get_provider_factory",
    "normalize_candle",
    "normalize_candles",
]

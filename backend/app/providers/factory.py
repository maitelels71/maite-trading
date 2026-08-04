"""Route instruments to the correct market data provider."""

from functools import lru_cache

from app.core.config import Settings, settings
from app.domain.enums import DataProviderName, MarketType
from app.ports.market_data import MarketDataProvider
from app.providers.schwab import SchwabProvider
from app.providers.tradeadvocate import TradeAdvocateProvider


class ProviderFactory:
    """Create / cache providers and resolve by market type or explicit name."""

    def __init__(self, config: Settings | None = None) -> None:
        self._config = config or settings
        self._schwab = SchwabProvider(self._config)
        self._tradeadvocate = TradeAdvocateProvider(self._config)

    def get(self, provider: DataProviderName | str) -> MarketDataProvider:
        name = DataProviderName(provider)
        if name is DataProviderName.SCHWAB:
            return self._schwab
        if name is DataProviderName.TRADEADVOCATE:
            return self._tradeadvocate
        raise ValueError(f"Unknown market data provider: {provider}")

    def for_market_type(self, market_type: MarketType | str) -> MarketDataProvider:
        mt = MarketType(market_type)
        if mt in (MarketType.STOCK, MarketType.ETF):
            return self._schwab
        if mt is MarketType.FUTURE:
            return self._tradeadvocate
        raise ValueError(f"No provider mapped for market_type={market_type}")


@lru_cache
def get_provider_factory() -> ProviderFactory:
    return ProviderFactory()

"""Application-wide constants."""

from app.domain.enums import DataProviderName, MarketType, Timeframe

DEFAULT_TIMEZONE = "America/New_York"
DEFAULT_OPENING_RANGE_MINUTES = 5

SUPPORTED_TIMEFRAMES: tuple[Timeframe, ...] = (
    Timeframe.M1,
    Timeframe.M5,
    Timeframe.M15,
    Timeframe.M30,
    Timeframe.H1,
    Timeframe.H4,
    Timeframe.D1,
)

# Seed universe for MVP (persisted in Prompt 3).
MVP_INSTRUMENTS: tuple[dict[str, str], ...] = (
    {
        "symbol": "NQ",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "E-mini Nasdaq-100",
    },
    {
        "symbol": "ES",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "E-mini S&P 500",
    },
    {
        "symbol": "GC",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "Gold Futures",
    },
    {
        "symbol": "6E",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "Euro FX Futures",
    },
    {
        "symbol": "AMZN",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Amazon.com Inc",
    },
    {
        "symbol": "TSLA",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Tesla Inc",
    },
    {
        "symbol": "SPY",
        "market_type": MarketType.ETF.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "SPDR S&P 500 ETF",
    },
    {
        "symbol": "QQQ",
        "market_type": MarketType.ETF.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Invesco QQQ Trust",
    },
)

STRATEGY_ORB = "opening_range_breakout"

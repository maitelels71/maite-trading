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
    {
        "symbol": "AAPL",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Apple Inc",
    },
    {
        "symbol": "AMZN",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Amazon.com Inc",
    },
    {
        "symbol": "META",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Meta Platforms Inc",
    },
    {
        "symbol": "NFLX",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Netflix Inc",
    },
    {
        "symbol": "TSLA",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Tesla Inc",
    },
    {
        "symbol": "NVDA",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "NVIDIA Corp",
    },
    {
        "symbol": "BAC",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Bank of America",
    },
)

STRATEGY_ORB = "opening_range_breakout"
STRATEGY_E04_BB15_GAP = "bb15_gap_open"
STRATEGY_E03_MAGNET = "magnet_ma20_gap"
STRATEGY_E02_DAILY_MID = "daily_mid_bounce"
STRATEGY_E01_BB_FLIP = "bb_trend_flip_h"
STRATEGY_CR01_MA40 = "cr01_ma40_bounce"
STRATEGY_CR02_DROP = "cr02_drop_green"
STRATEGY_CR03_CHANNEL = "cr03_channel_break"
STRATEGY_CR04_GAP_UP = "cr04_gap_up_green"
STRATEGY_CR05_GAP_DOWN = "cr05_gap_down_green"
STRATEGY_CR06_FLOOR = "cr06_strong_floor"
STRATEGY_CR07_PUT_CH = "cr07_put_channel"
STRATEGY_CR08_FIRST_RED = "cr08_first_red"
STRATEGY_CR09_GAP_FLOOR = "cr09_gap_floor_put"
STRATEGY_CR10_HANGER = "cr10_daily_hanger"
STRATEGY_CR11_EARNINGS = "cr11_earnings_floor"

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
# Options desk (Schwab): index ETFs + liquid megacaps for CR/E options scans.
# Futures desk: analysis candles come from Yahoo (NQ=F / MNQ=F / ES=F / MES=F).
MVP_INSTRUMENTS: tuple[dict[str, str], ...] = (
    {
        "symbol": "NQ",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "E-mini Nasdaq-100",
    },
    {
        "symbol": "MNQ",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "Micro E-mini Nasdaq-100",
    },
    {
        "symbol": "ES",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "E-mini S&P 500",
    },
    {
        "symbol": "MES",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "Micro E-mini S&P 500",
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
        "symbol": "MSFT",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Microsoft Corp",
    },
    {
        "symbol": "AMZN",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Amazon.com Inc",
    },
    {
        "symbol": "GOOGL",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Alphabet Inc Class A",
    },
    {
        "symbol": "META",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Meta Platforms Inc",
    },
    {
        "symbol": "NVDA",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "NVIDIA Corp",
    },
    {
        "symbol": "TSLA",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Tesla Inc",
    },
    {
        "symbol": "NFLX",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Netflix Inc",
    },
    {
        "symbol": "IOVA",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Iovance Biotherapeutics Inc",
    },
    {
        "symbol": "IWM",
        "market_type": MarketType.ETF.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "iShares Russell 2000 ETF",
    },
    {
        "symbol": "USAR",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "USA Rare Earth Inc",
    },
    {
        "symbol": "UUUU",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Energy Fuels Inc",
    },
    {
        "symbol": "ONDS",
        "market_type": MarketType.STOCK.value,
        "data_provider": DataProviderName.SCHWAB.value,
        "name": "Ondas Holdings Inc",
    },
)

STRATEGY_ORB = "opening_range_breakout"
STRATEGY_E04_BB15_GAP = "bb15_gap_open"
STRATEGY_E03_MAGNET = "magnet_ma20_gap"
STRATEGY_E02_DAILY_MID = "daily_mid_bounce"
STRATEGY_E01_BB_FLIP = "bb_trend_flip_h"
STRATEGY_ML01_STRUCTURE = "ml01_structure_choch_bos"
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

# SMS alerts: Options TOP5 needs ≥2 playbooks agreeing on CALL or PUT.
ALERT_TOP_N = 5
ALERT_MIN_CONFLUENCE = 2

OPTIONS_ALERT_STRATEGIES: tuple[str, ...] = (
    STRATEGY_E01_BB_FLIP,
    STRATEGY_E02_DAILY_MID,
    STRATEGY_E03_MAGNET,
    STRATEGY_E04_BB15_GAP,
    STRATEGY_CR01_MA40,
    STRATEGY_CR02_DROP,
    STRATEGY_CR03_CHANNEL,
    STRATEGY_CR04_GAP_UP,
    STRATEGY_CR05_GAP_DOWN,
    STRATEGY_CR06_FLOOR,
    STRATEGY_CR07_PUT_CH,
    STRATEGY_CR08_FIRST_RED,
    STRATEGY_CR09_GAP_FLOOR,
    STRATEGY_CR10_HANGER,
    STRATEGY_CR11_EARNINGS,
)

FUTURES_ALERT_STRATEGIES: tuple[str, ...] = (STRATEGY_ML01_STRUCTURE,)

STRATEGY_SHORT_LABEL: dict[str, str] = {
    STRATEGY_E01_BB_FLIP: "E01",
    STRATEGY_E02_DAILY_MID: "E02",
    STRATEGY_E03_MAGNET: "E03",
    STRATEGY_E04_BB15_GAP: "E04",
    STRATEGY_ML01_STRUCTURE: "ML01",
    STRATEGY_CR01_MA40: "CR01",
    STRATEGY_CR02_DROP: "CR02",
    STRATEGY_CR03_CHANNEL: "CR03",
    STRATEGY_CR04_GAP_UP: "CR04",
    STRATEGY_CR05_GAP_DOWN: "CR05",
    STRATEGY_CR06_FLOOR: "CR06",
    STRATEGY_CR07_PUT_CH: "CR07",
    STRATEGY_CR08_FIRST_RED: "CR08",
    STRATEGY_CR09_GAP_FLOOR: "CR09",
    STRATEGY_CR10_HANGER: "CR10",
    STRATEGY_CR11_EARNINGS: "CR11",
    STRATEGY_ORB: "ORB",
}

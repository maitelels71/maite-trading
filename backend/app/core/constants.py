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
# Futures desk: micros + FX + gold via Yahoo (MNQ=F, MES=F, 6E/6B/6A=F, GC=F).
MVP_INSTRUMENTS: tuple[dict[str, str], ...] = (
    {
        "symbol": "MNQ",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "Micro E-mini Nasdaq-100",
    },
    {
        "symbol": "MES",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "Micro E-mini S&P 500",
    },
    {
        "symbol": "6E",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "Euro FX Futures",
    },
    {
        "symbol": "6A",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "Australian Dollar Futures",
    },
    {
        "symbol": "6B",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "British Pound Futures",
    },
    {
        "symbol": "GC",
        "market_type": MarketType.FUTURE.value,
        "data_provider": DataProviderName.TRADEADVOCATE.value,
        "name": "Gold Futures",
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
STRATEGY_ML02_H4 = "ml02_h4_15m_1m"
# Deprecated alias — same engine as STRATEGY_ML02_H4 (H4→15M→1M).
STRATEGY_ML02_SCM = STRATEGY_ML02_H4
STRATEGY_ML03_FIRST_NY5 = "ml03_first_ny5m"
STRATEGY_CH01_GAP_GO = "ch01_gap_go"
STRATEGY_CH02_VWAP_REV = "ch02_vwap_reversion"
STRATEGY_CH03_EMA_CROSS = "ch03_ema_cross"
STRATEGY_CH04_RSI_EXT = "ch04_rsi_extreme"
STRATEGY_CH05_REL_STRENGTH = "ch05_rel_strength"
STRATEGY_CH06_ORB = "ch06_orb"
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
    STRATEGY_ML02_H4,
)

# Channel CH01–CH06 are Options Focus/Analyzer lab strategies. Promote winners
# into OPTIONS_ALERT_STRATEGIES when you keep the top X.
CHANNEL_LAB_STRATEGIES: tuple[str, ...] = (
    STRATEGY_CH01_GAP_GO,
    STRATEGY_CH02_VWAP_REV,
    STRATEGY_CH03_EMA_CROSS,
    STRATEGY_CH04_RSI_EXT,
    STRATEGY_CH05_REL_STRENGTH,
    STRATEGY_CH06_ORB,
)

FUTURES_ALERT_STRATEGIES: tuple[str, ...] = (
    STRATEGY_ML01_STRUCTURE,
    STRATEGY_ML02_H4,
    STRATEGY_ML03_FIRST_NY5,
)

STRATEGY_SHORT_LABEL: dict[str, str] = {
    STRATEGY_E01_BB_FLIP: "E01",
    STRATEGY_E02_DAILY_MID: "E02",
    STRATEGY_E03_MAGNET: "E03",
    STRATEGY_E04_BB15_GAP: "E04",
    STRATEGY_ML01_STRUCTURE: "ML01",
    STRATEGY_ML02_H4: "ML02",
    STRATEGY_ML03_FIRST_NY5: "ML03",
    STRATEGY_CH01_GAP_GO: "CH01",
    STRATEGY_CH02_VWAP_REV: "CH02",
    STRATEGY_CH03_EMA_CROSS: "CH03",
    STRATEGY_CH04_RSI_EXT: "CH04",
    STRATEGY_CH05_REL_STRENGTH: "CH05",
    STRATEGY_CH06_ORB: "CH06",
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

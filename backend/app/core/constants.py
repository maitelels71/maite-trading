"""Shared application constants."""

from zoneinfo import ZoneInfo

APP_TIMEZONE_NAME = "America/New_York"
APP_TIMEZONE = ZoneInfo(APP_TIMEZONE_NAME)

RTH_SESSION_START = (9, 30)  # 09:30 ET
RTH_SESSION_END = (16, 0)  # 16:00 ET

DEFAULT_OPENING_RANGE_MINUTES = 5
DEFAULT_TIMEFRAME = "1m"

STRATEGY_ORB = "opening_range_breakout"

PROVIDER_SCHWAB = "schwab"
PROVIDER_TRADEADVOCATE = "tradeadvocate"
PROVIDER_MOCK = "mock"

MVP_FUTURES = ("NQ", "ES", "GC", "6E")
MVP_EQUITIES = ("AMZN", "TSLA", "SPY", "QQQ")

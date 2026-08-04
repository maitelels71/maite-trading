"""Shared domain enumerations."""

from enum import StrEnum


class MarketType(StrEnum):
    STOCK = "stock"
    ETF = "etf"
    FUTURE = "future"


class DataProviderName(StrEnum):
    SCHWAB = "schwab"
    TRADEADVOCATE = "tradeadvocate"


class Timeframe(StrEnum):
    M1 = "1m"
    M5 = "5m"
    M15 = "15m"
    M30 = "30m"
    H1 = "1h"
    H4 = "4h"
    D1 = "1d"


class Side(StrEnum):
    LONG = "long"
    SHORT = "short"
    FLAT = "flat"


class SessionType(StrEnum):
    RTH = "RTH"
    ETH = "ETH"


class StrategyStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"

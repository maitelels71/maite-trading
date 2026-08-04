"""Domain enumerations."""

from enum import Enum


class AssetClass(str, Enum):
    STOCK = "stock"
    ETF = "etf"
    FUTURE = "future"


class ProviderName(str, Enum):
    SCHWAB = "schwab"
    TRADEADVOCATE = "tradeadvocate"
    MOCK = "mock"


class Side(str, Enum):
    LONG = "long"
    SHORT = "short"
    FLAT = "flat"


class SignalType(str, Enum):
    ENTRY_LONG = "entry_long"
    ENTRY_SHORT = "entry_short"
    EXIT_LONG = "exit_long"
    EXIT_SHORT = "exit_short"
    REVERSE_TO_LONG = "reverse_to_long"
    REVERSE_TO_SHORT = "reverse_to_short"
    FLATTEN = "flatten"


class TradeStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"


class BacktestStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Timeframe(str, Enum):
    M1 = "1m"
    M5 = "5m"
    M15 = "15m"
    H1 = "1h"
    D1 = "1d"

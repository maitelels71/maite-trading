"""Strategy evaluation context and result types."""

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from app.domain.candles import Candle
from app.domain.enums import SessionType
from app.domain.signals import Signal
from app.domain.trades import Trade


@dataclass(frozen=True, slots=True)
class StrategyContext:
    """Inputs shared by every strategy evaluation."""

    ticker: str
    timeframe: str
    start: date | datetime
    end: date | datetime
    parameters: dict[str, Any] = field(default_factory=dict)
    timezone: str = "America/New_York"
    session: SessionType = SessionType.RTH
    """Optional multi-TF series keyed by timeframe string (e.g. \"1h\", \"15m\")."""
    extra_candles: dict[str, list[Candle]] = field(default_factory=dict)

@dataclass(frozen=True, slots=True)
class StrategyMetrics:
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    profit_loss: Decimal = Decimal("0")
    max_drawdown: Decimal = Decimal("0")


@dataclass(frozen=True, slots=True)
class StrategyResult:
    signals: list[Signal] = field(default_factory=list)
    trades: list[Trade] = field(default_factory=list)
    metrics: StrategyMetrics = field(default_factory=StrategyMetrics)

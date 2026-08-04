"""Strategy parameter and result types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from app.domain.signals import Signal
from app.domain.trades import Trade


@dataclass(frozen=True, slots=True)
class StrategyParams:
    opening_range_minutes: int = 5
    quantity: Decimal = Decimal("1")
    allow_long: bool = True
    allow_short: bool = True
    flatten_at_session_end: bool = True
    extra: Dict[str, Any] = field(default_factory=dict)

    def validated(self) -> "StrategyParams":
        if self.opening_range_minutes <= 0:
            raise ValueError("opening_range_minutes must be > 0")
        if self.quantity <= 0:
            raise ValueError("quantity must be > 0")
        return self


@dataclass(slots=True)
class StrategyResult:
    strategy_id: str
    symbol: str
    signals: List[Signal] = field(default_factory=list)
    trades: List[Trade] = field(default_factory=list)
    params: Optional[StrategyParams] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def total_pnl(self) -> Decimal:
        return sum((t.pnl or Decimal("0") for t in self.trades), Decimal("0"))

    @property
    def closed_trade_count(self) -> int:
        return sum(1 for t in self.trades if not t.is_open)

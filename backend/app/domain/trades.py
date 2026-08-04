"""Trade domain objects."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import uuid4

from app.domain.enums import Side, TradeStatus


@dataclass(slots=True)
class Trade:
    symbol: str
    side: Side
    quantity: Decimal
    entry_price: Decimal
    entry_time: datetime
    exit_price: Optional[Decimal] = None
    exit_time: Optional[datetime] = None
    status: TradeStatus = TradeStatus.OPEN
    pnl: Optional[Decimal] = None
    id: str = field(default_factory=lambda: str(uuid4()))

    def close(self, exit_price: Decimal, exit_time: datetime) -> None:
        if self.status == TradeStatus.CLOSED:
            raise ValueError("trade already closed")
        self.exit_price = exit_price
        self.exit_time = exit_time
        self.status = TradeStatus.CLOSED
        direction = Decimal("1") if self.side == Side.LONG else Decimal("-1")
        self.pnl = (exit_price - self.entry_price) * self.quantity * direction

    @property
    def is_open(self) -> bool:
        return self.status == TradeStatus.OPEN

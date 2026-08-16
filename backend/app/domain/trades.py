"""Trade domain type produced by strategy evaluation."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from app.domain.enums import Side


@dataclass(frozen=True, slots=True)
class Trade:
    side: Side
    entry_time: datetime
    entry_price: Decimal
    signal: str
    exit_time: datetime | None = None
    exit_price: Decimal | None = None
    profit_loss: Decimal | None = None
    notes: str | None = None
    # Optional chart geometry (OB, liquidity, SCM, SL/TP) for Analyzer overlays.
    setup: dict[str, Any] | None = None

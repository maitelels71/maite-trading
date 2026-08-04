"""Strategy signal domain type."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from app.domain.enums import Side


@dataclass(frozen=True, slots=True)
class Signal:
    timestamp: datetime
    side: Side
    price: Decimal
    reason: str
    ticker: str = ""

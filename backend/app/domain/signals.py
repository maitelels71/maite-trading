"""Signal domain objects."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional

from app.domain.enums import Side, SignalType


@dataclass(frozen=True, slots=True)
class Signal:
    symbol: str
    timestamp: datetime
    signal_type: SignalType
    side: Side
    price: Decimal
    reason: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_entry(self) -> bool:
        return self.signal_type in {
            SignalType.ENTRY_LONG,
            SignalType.ENTRY_SHORT,
            SignalType.REVERSE_TO_LONG,
            SignalType.REVERSE_TO_SHORT,
        }

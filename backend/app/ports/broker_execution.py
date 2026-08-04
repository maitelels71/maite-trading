"""Broker execution port (OAuth later; stubs for v1)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional

from app.domain.enums import Side


@dataclass(frozen=True, slots=True)
class OrderRequest:
    symbol: str
    side: Side
    quantity: Decimal
    order_type: str = "market"
    limit_price: Optional[Decimal] = None


@dataclass(frozen=True, slots=True)
class OrderResult:
    order_id: str
    symbol: str
    side: Side
    quantity: Decimal
    fill_price: Decimal
    filled_at: datetime
    status: str = "filled"


class BrokerExecutionPort(ABC):
    """Port for placing orders with a broker. Not required for v1 backtests."""

    name: str

    @abstractmethod
    def place_order(self, order: OrderRequest) -> OrderResult:
        raise NotImplementedError

    def cancel_order(self, order_id: str) -> bool:
        return False

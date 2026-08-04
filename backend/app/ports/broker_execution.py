"""Broker execution port — future phase only (TradeAdvocate futures tickets)."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol, runtime_checkable

from app.domain.enums import Side


@dataclass(frozen=True, slots=True)
class OrderRequest:
    symbol: str
    side: Side
    quantity: Decimal
    order_type: str = "market"
    limit_price: Decimal | None = None


@dataclass(frozen=True, slots=True)
class OrderResult:
    order_id: str
    status: str
    message: str = ""


@dataclass(frozen=True, slots=True)
class Position:
    symbol: str
    side: Side
    quantity: Decimal
    avg_price: Decimal


@runtime_checkable
class BrokerExecutionPort(Protocol):
    """Live order placement — not implemented in v1 research mode."""

    def place_order(self, order: OrderRequest) -> OrderResult: ...

    def cancel_order(self, order_id: str) -> OrderResult: ...

    def get_positions(self) -> list[Position]: ...

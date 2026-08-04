"""TradeAdvocate broker execution stub (OAuth / live orders later)."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.core.constants import PROVIDER_TRADEADVOCATE
from app.ports.broker_execution import BrokerExecutionPort, OrderRequest, OrderResult
from app.providers.exceptions import ProviderError


class TradeAdvocateBroker(BrokerExecutionPort):
    """v1 stub — raises until broker OAuth is wired."""

    name = PROVIDER_TRADEADVOCATE

    def __init__(self, enabled: bool = False) -> None:
        self.enabled = enabled

    def place_order(self, order: OrderRequest) -> OrderResult:
        if not self.enabled:
            raise ProviderError(
                "TradeAdvocate broker execution is not enabled in v1 "
                "(broker OAuth required later)"
            )
        return OrderResult(
            order_id=str(uuid4()),
            symbol=order.symbol,
            side=order.side,
            quantity=order.quantity,
            fill_price=order.limit_price or order.quantity,  # placeholder
            filled_at=datetime.now(timezone.utc),
            status="filled",
        )

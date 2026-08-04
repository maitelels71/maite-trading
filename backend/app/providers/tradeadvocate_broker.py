"""Future-phase execution stub — do not enable live orders in v1."""

from app.ports.broker_execution import OrderRequest, OrderResult, Position


class TradeAdvocateBroker:
    """BrokerExecutionPort stub for futures tickets (Prompt 14)."""

    def place_order(self, order: OrderRequest) -> OrderResult:
        raise NotImplementedError(
            "Live TradeAdvocate order execution is deferred (Prompt 14). "
            f"Refused place_order for {order.symbol}"
        )

    def cancel_order(self, order_id: str) -> OrderResult:
        raise NotImplementedError(
            f"Live TradeAdvocate cancel_order is deferred (Prompt 14): {order_id}"
        )

    def get_positions(self) -> list[Position]:
        raise NotImplementedError(
            "Live TradeAdvocate get_positions is deferred (Prompt 14)"
        )

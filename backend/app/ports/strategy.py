"""Strategy port — broker-agnostic trading algorithms."""

from typing import Any, Protocol, runtime_checkable

from app.domain.candles import Candle
from app.domain.strategy_types import StrategyContext, StrategyResult


@runtime_checkable
class Strategy(Protocol):
    """Evaluate candles and produce signals, trades, and metrics."""

    @property
    def name(self) -> str:
        """Stable strategy key, e.g. opening_range_breakout."""

    @property
    def description(self) -> str:
        """Human-readable summary for API/UI."""

    @property
    def default_parameters(self) -> dict[str, Any]:
        """Default parameter map exposed via GET /strategies."""

    def evaluate(
        self,
        candles: list[Candle],
        context: StrategyContext,
    ) -> StrategyResult:
        """Run the strategy over the provided candles only — no broker I/O."""

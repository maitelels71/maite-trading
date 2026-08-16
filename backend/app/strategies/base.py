"""Abstract strategy helpers (optional base for concrete strategies)."""

from abc import ABC, abstractmethod
from typing import Any

from app.domain.candles import Candle
from app.domain.strategy_types import StrategyContext, StrategyResult


class BaseStrategy(ABC):
    """Convenience ABC that satisfies the Strategy protocol.

    Historical backtest contract (Futures + Options Analyzer):
    - ``evaluate`` should walk every session day in ``[context.start, context.end]``
    - Live scan passes ``start=end=session_day`` (one day)
    - Prefer closed ``Trade`` rows (exit + profit_loss) so win-rate/PnL populate
    - Use helpers in ``app.strategies.backtest_utils`` for new strategies
    """

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def description(self) -> str: ...

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {}

    @property
    def scan_timeframe(self) -> str | None:
        """If set, scanner loads this TF instead of the request timeframe."""
        return None

    @property
    def scan_lookback_days(self) -> int:
        """Extra calendar days of candles before session_date for indicators."""
        return 0

    @property
    def scan_extra_timeframes(self) -> tuple[str, ...]:
        """Additional TFs loaded into context.extra_candles for multi-TF strategies."""
        return ()

    @abstractmethod
    def evaluate(
        self,
        candles: list[Candle],
        context: StrategyContext,
    ) -> StrategyResult: ...

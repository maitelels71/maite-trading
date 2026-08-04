"""Abstract strategy helpers (optional base for concrete strategies)."""

from abc import ABC, abstractmethod
from typing import Any

from app.domain.candles import Candle
from app.domain.strategy_types import StrategyContext, StrategyResult


class BaseStrategy(ABC):
    """Convenience ABC that satisfies the Strategy protocol."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def description(self) -> str: ...

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {}

    @abstractmethod
    def evaluate(
        self,
        candles: list[Candle],
        context: StrategyContext,
    ) -> StrategyResult: ...

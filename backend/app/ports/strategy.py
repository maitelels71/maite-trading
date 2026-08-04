"""Strategy port."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Sequence

from app.domain.candles import Candle
from app.domain.strategy_types import StrategyParams, StrategyResult


class Strategy(ABC):
    """Port implemented by concrete trading strategies."""

    id: str
    name: str
    description: str

    @abstractmethod
    def evaluate(
        self,
        symbol: str,
        candles: Sequence[Candle],
        params: StrategyParams | None = None,
    ) -> StrategyResult:
        raise NotImplementedError


class StrategyRegistryPort(ABC):
    @abstractmethod
    def list_strategies(self) -> List[Strategy]:
        raise NotImplementedError

    @abstractmethod
    def get(self, strategy_id: str) -> Strategy:
        raise NotImplementedError

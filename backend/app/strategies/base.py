"""Strategy base helpers."""

from __future__ import annotations

from abc import ABC
from typing import Sequence

from app.domain.candles import Candle, ensure_monotonic, sort_candles
from app.domain.strategy_types import StrategyParams, StrategyResult
from app.ports.strategy import Strategy


class BaseStrategy(Strategy, ABC):
    id: str = "base"
    name: str = "Base Strategy"
    description: str = ""

    def prepare_candles(self, candles: Sequence[Candle]) -> list[Candle]:
        ordered = sort_candles(candles)
        ensure_monotonic(ordered)
        return ordered

    def default_params(self) -> StrategyParams:
        return StrategyParams()

    def evaluate(
        self,
        symbol: str,
        candles: Sequence[Candle],
        params: StrategyParams | None = None,
    ) -> StrategyResult:
        raise NotImplementedError

"""In-process strategy registry."""

from __future__ import annotations

from typing import Dict, List

from app.ports.strategy import Strategy, StrategyRegistryPort
from app.strategies.opening_range_breakout import OpeningRangeBreakoutStrategy


class StrategyRegistry(StrategyRegistryPort):
    def __init__(self) -> None:
        orb = OpeningRangeBreakoutStrategy()
        self._strategies: Dict[str, Strategy] = {orb.id: orb}

    def list_strategies(self) -> List[Strategy]:
        return list(self._strategies.values())

    def get(self, strategy_id: str) -> Strategy:
        try:
            return self._strategies[strategy_id]
        except KeyError as exc:
            raise KeyError(f"unknown strategy: {strategy_id}") from exc

    def register(self, strategy: Strategy) -> None:
        self._strategies[strategy.id] = strategy


_REGISTRY: StrategyRegistry | None = None


def get_strategy_registry() -> StrategyRegistry:
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = StrategyRegistry()
    return _REGISTRY

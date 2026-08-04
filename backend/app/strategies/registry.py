"""Strategy registry — resolve algorithms by name without broker coupling."""

from app.ports.strategy import Strategy
from app.strategies.opening_range_breakout import OpeningRangeBreakoutStrategy


class StrategyRegistry:
    def __init__(self) -> None:
        self._strategies: dict[str, Strategy] = {}

    def register(self, strategy: Strategy) -> None:
        self._strategies[strategy.name] = strategy

    def get(self, name: str) -> Strategy:
        try:
            return self._strategies[name]
        except KeyError as exc:
            known = ", ".join(sorted(self._strategies)) or "(none)"
            raise KeyError(f"Unknown strategy '{name}'. Known: {known}") from exc

    def list(self) -> list[Strategy]:
        return list(self._strategies.values())


def build_default_registry() -> StrategyRegistry:
    registry = StrategyRegistry()
    registry.register(OpeningRangeBreakoutStrategy())
    return registry


_default_registry: StrategyRegistry | None = None


def get_strategy_registry() -> StrategyRegistry:
    global _default_registry
    if _default_registry is None:
        _default_registry = build_default_registry()
    return _default_registry

from app.ports.strategy import Strategy
from app.strategies.bb15_gap_open import Bb15GapOpenStrategy
from app.strategies.bb_trend_flip_h import BbTrendFlipHStrategy
from app.strategies.creando_riquezas import ALL_CR_STRATEGIES
from app.strategies.daily_mid_bounce import DailyMidBounceStrategy
from app.strategies.magnet_ma20_gap import MagnetMa20GapStrategy
from app.strategies.ml01_structure_choch_bos import Ml01StructureChochBosStrategy
from app.strategies.ml02_single_candle_mitigation import (
    Ml02SingleCandleMitigationStrategy,
)
from app.strategies.ml03_first_ny5m import Ml03FirstNy5mStrategy
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
    registry.register(Bb15GapOpenStrategy())
    registry.register(MagnetMa20GapStrategy())
    registry.register(DailyMidBounceStrategy())
    registry.register(BbTrendFlipHStrategy())
    registry.register(Ml01StructureChochBosStrategy())
    registry.register(Ml02SingleCandleMitigationStrategy())
    registry.register(Ml03FirstNy5mStrategy())
    for strategy in ALL_CR_STRATEGIES:
        registry.register(strategy)
    return registry


_default_registry: StrategyRegistry | None = None


def get_strategy_registry() -> StrategyRegistry:
    global _default_registry
    if _default_registry is None:
        _default_registry = build_default_registry()
    return _default_registry

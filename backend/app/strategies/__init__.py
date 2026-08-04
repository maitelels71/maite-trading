"""Trading strategies — broker-agnostic algorithms."""

from app.strategies.base import BaseStrategy
from app.strategies.opening_range_breakout import OpeningRangeBreakoutStrategy
from app.strategies.registry import (
    StrategyRegistry,
    build_default_registry,
    get_strategy_registry,
)

__all__ = [
    "BaseStrategy",
    "OpeningRangeBreakoutStrategy",
    "StrategyRegistry",
    "build_default_registry",
    "get_strategy_registry",
]

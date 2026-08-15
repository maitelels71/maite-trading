"""Trading strategies — broker-agnostic algorithms."""

from app.strategies.base import BaseStrategy
from app.strategies.bb15_gap_open import Bb15GapOpenStrategy
from app.strategies.bb_trend_flip_h import BbTrendFlipHStrategy
from app.strategies.daily_mid_bounce import DailyMidBounceStrategy
from app.strategies.magnet_ma20_gap import MagnetMa20GapStrategy
from app.strategies.ml01_structure_choch_bos import Ml01StructureChochBosStrategy
from app.strategies.ml02_single_candle_mitigation import (
    Ml02SingleCandleMitigationStrategy,
)
from app.strategies.opening_range_breakout import OpeningRangeBreakoutStrategy
from app.strategies.registry import (
    StrategyRegistry,
    build_default_registry,
    get_strategy_registry,
)

__all__ = [
    "BaseStrategy",
    "Bb15GapOpenStrategy",
    "BbTrendFlipHStrategy",
    "DailyMidBounceStrategy",
    "MagnetMa20GapStrategy",
    "Ml01StructureChochBosStrategy",
    "Ml02SingleCandleMitigationStrategy",
    "OpeningRangeBreakoutStrategy",
    "StrategyRegistry",
    "build_default_registry",
    "get_strategy_registry",
]

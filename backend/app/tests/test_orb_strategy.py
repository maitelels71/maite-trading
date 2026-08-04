"""Opening Range Breakout unit tests."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.strategy_types import StrategyContext
from app.strategies.opening_range_breakout import OpeningRangeBreakoutStrategy

ET = ZoneInfo("America/New_York")


def _c(hour: int, minute: int, high: str, low: str, close: str) -> Candle:
    ts = datetime(2026, 1, 5, hour, minute, tzinfo=ET)  # Monday
    return Candle(
        timestamp=ts,
        open=Decimal(close),
        high=Decimal(high),
        low=Decimal(low),
        close=Decimal(close),
        volume=Decimal("100"),
        ticker="SPY",
        timeframe="5m",
    )


def test_orb_long_breakout_and_eod_flat() -> None:
    # Opening range 9:30-9:35: high 100, low 99
    candles = [
        _c(9, 30, "100", "99", "99.5"),
        _c(9, 35, "101", "100", "100.8"),  # breakout high
        _c(15, 55, "102", "100.5", "101.5"),
    ]
    strategy = OpeningRangeBreakoutStrategy()
    result = strategy.evaluate(
        candles,
        StrategyContext(
            ticker="SPY",
            timeframe="5m",
            start=datetime(2026, 1, 5),
            end=datetime(2026, 1, 5),
            parameters={"opening_range_minutes": 5},
        ),
    )
    assert any(s.side is Side.LONG for s in result.signals)
    assert result.metrics.total_trades == 1
    assert result.trades[0].side is Side.LONG
    assert result.trades[0].profit_loss == Decimal("101.5") - Decimal("100.8")


def test_orb_short_breakout() -> None:
    candles = [
        _c(9, 30, "100", "99", "99.5"),
        _c(9, 35, "99", "98", "98.2"),  # breakout low
        _c(15, 55, "98.5", "97.5", "97.8"),
    ]
    strategy = OpeningRangeBreakoutStrategy()
    result = strategy.evaluate(
        candles,
        StrategyContext(
            ticker="NQ",
            timeframe="5m",
            start=datetime(2026, 1, 5),
            end=datetime(2026, 1, 5),
            parameters={"opening_range_minutes": 5},
        ),
    )
    assert any(s.side is Side.SHORT for s in result.signals)
    assert result.trades[0].side is Side.SHORT
    # short pnl = entry - exit = 98.2 - 97.8
    assert result.trades[0].profit_loss == Decimal("0.4")


def test_orb_ignores_premarket() -> None:
    candles = [
        _c(8, 0, "120", "110", "115"),  # premarket noise
        _c(9, 30, "100", "99", "99.5"),
        _c(9, 35, "101", "100", "100.5"),
        _c(15, 55, "101", "100", "100.7"),
    ]
    strategy = OpeningRangeBreakoutStrategy()
    result = strategy.evaluate(
        candles,
        StrategyContext(
            ticker="SPY",
            timeframe="5m",
            start=datetime(2026, 1, 5),
            end=datetime(2026, 1, 5),
        ),
    )
    assert result.metrics.total_trades == 1
    assert result.trades[0].entry_price == Decimal("100.5")

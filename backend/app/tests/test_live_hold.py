"""Live-hold stale-signal filter tests."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.signals import Signal
from app.domain.strategy_types import StrategyMetrics, StrategyResult
from app.strategies.live_hold import drop_reversed_session_signals

ET = ZoneInfo("America/New_York")


def _c(ts: datetime, o: str, h: str, l: str, c: str) -> Candle:
    return Candle(
        timestamp=ts,
        open=Decimal(o),
        high=Decimal(h),
        low=Decimal(l),
        close=Decimal(c),
        volume=Decimal("100"),
        ticker="AAPL",
        timeframe="1h",
    )


def test_drop_reversed_long_after_fade() -> None:
    day = datetime(2026, 1, 6, tzinfo=ET)
    flip = day.replace(hour=10, minute=0)
    fade = day.replace(hour=11, minute=0)
    candles = [
        _c(flip, "100", "108", "99", "107"),
        _c(fade, "107", "107.5", "102", "103"),
    ]
    result = StrategyResult(
        signals=[
            Signal(
                timestamp=flip,
                side=Side.LONG,
                price=Decimal("107"),
                reason="E01 CALL",
                ticker="AAPL",
            )
        ],
        trades=[],
        metrics=StrategyMetrics(),
    )
    out = drop_reversed_session_signals(
        result,
        candles,
        session_day=day.date(),
        timeframe="1h",
        now=day.replace(hour=11, minute=45),
    )
    assert out.signals == []


def test_keep_long_when_still_above_signal() -> None:
    day = datetime(2026, 1, 6, tzinfo=ET)
    flip = day.replace(hour=10, minute=0)
    hold = day.replace(hour=11, minute=0)
    candles = [
        _c(flip, "100", "108", "99", "107"),
        _c(hold, "107", "110", "106.5", "109"),
    ]
    result = StrategyResult(
        signals=[
            Signal(
                timestamp=flip,
                side=Side.LONG,
                price=Decimal("107"),
                reason="E01 CALL",
                ticker="AAPL",
            )
        ],
        trades=[],
        metrics=StrategyMetrics(),
    )
    out = drop_reversed_session_signals(
        result,
        candles,
        session_day=day.date(),
        timeframe="1h",
        now=day.replace(hour=11, minute=45),
    )
    assert len(out.signals) == 1


def test_daily_timeframe_not_filtered() -> None:
    day = datetime(2026, 1, 6, tzinfo=ET)
    bar = day.replace(hour=9, minute=30)
    candles = [_c(bar, "100", "101", "99", "100.5")]
    result = StrategyResult(
        signals=[
            Signal(
                timestamp=bar,
                side=Side.SHORT,
                price=Decimal("100.5"),
                reason="CR10",
                ticker="AAPL",
            )
        ],
        trades=[],
        metrics=StrategyMetrics(),
    )
    out = drop_reversed_session_signals(
        result,
        candles,
        session_day=day.date(),
        timeframe="1d",
        now=day.replace(hour=12, minute=0),
    )
    assert len(out.signals) == 1

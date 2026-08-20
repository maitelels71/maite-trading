"""ML03 First NY 5m candle unit tests."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.core.constants import STRATEGY_ML03_FIRST_NY5
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.strategy_types import StrategyContext
from app.strategies.ml03_first_ny5m import (
    Ml03FirstNy5mStrategy,
    detect_break_fvg,
    find_first_ny_5m,
    is_bullish_engulfing,
)
from app.strategies.registry import build_default_registry

ET = ZoneInfo("America/New_York")


def _c(
    ts: datetime,
    o: str,
    h: str,
    l: str,
    c: str,
    *,
    tf: str = "5m",
) -> Candle:
    return Candle(
        timestamp=ts,
        open=Decimal(o),
        high=Decimal(h),
        low=Decimal(l),
        close=Decimal(c),
        volume=Decimal("100"),
        ticker="MNQ",
        timeframe=tf,
    )


def test_ml03_registered() -> None:
    s = build_default_registry().get(STRATEGY_ML03_FIRST_NY5)
    assert s.name == STRATEGY_ML03_FIRST_NY5
    assert s.scan_timeframe == "5m"
    assert "1m" in s.scan_extra_timeframes
    assert s.scan_live_when == "ny_open"


def test_find_first_ny_5m() -> None:
    day = date(2026, 8, 3)
    base = datetime(2026, 8, 3, 9, 30, tzinfo=ET)
    bars = [
        _c(base - timedelta(minutes=5), "100", "101", "99", "100"),
        _c(base, "100", "105", "99.5", "104"),
        _c(base + timedelta(minutes=5), "104", "106", "103", "105"),
    ]
    fr = find_first_ny_5m(bars, day=day, tz=ET)
    assert fr is not None
    assert fr.high == Decimal("105")
    assert fr.low == Decimal("99.5")


def test_break_fvg_and_engulfing() -> None:
    base = datetime(2026, 8, 3, 9, 35, tzinfo=ET)
    # Break above 105 with bullish FVG: a.high=104.5 < c.low=106
    ltf = [
        _c(base, "104", "104.5", "103.8", "104.2", tf="1m"),
        _c(base + timedelta(minutes=1), "104.2", "105.5", "104.0", "105.2", tf="1m"),
        _c(base + timedelta(minutes=2), "106.0", "107.0", "105.8", "106.5", tf="1m"),
    ]
    fvg = detect_break_fvg(ltf, level=Decimal("105"), side="bull", start_index=2)
    assert fvg is not None
    assert fvg.bottom == Decimal("104.5")
    assert fvg.top == Decimal("105.8")

    prior = _c(base + timedelta(minutes=3), "106.2", "106.4", "105.9", "106.0", tf="1m")
    eng = _c(base + timedelta(minutes=4), "105.8", "107.2", "105.7", "107.0", tf="1m")
    assert is_bullish_engulfing(prior, eng)


def test_ml03_evaluate_synthetic_long() -> None:
    day = date(2026, 8, 3)
    open_5 = datetime(2026, 8, 3, 9, 30, tzinfo=ET)
    m5 = [
        _c(open_5, "100", "105", "99.5", "104"),
        _c(open_5 + timedelta(minutes=5), "104", "106", "103", "105"),
    ]
    # After 9:35 — build break FVG above 105 then engulfing retest
    t0 = datetime(2026, 8, 3, 9, 35, tzinfo=ET)
    m1 = [
        _c(t0, "104.0", "104.5", "103.8", "104.2", tf="1m"),
        _c(t0 + timedelta(minutes=1), "104.2", "105.8", "104.0", "105.5", tf="1m"),
        _c(t0 + timedelta(minutes=2), "106.2", "107.0", "106.0", "106.8", tf="1m"),
        # retest into FVG (104.5–106.2) + bullish engulfing
        _c(t0 + timedelta(minutes=3), "106.0", "106.1", "105.6", "105.7", tf="1m"),
        _c(t0 + timedelta(minutes=4), "105.5", "108.5", "105.4", "108.0", tf="1m"),
        # runner toward TP
        _c(t0 + timedelta(minutes=5), "108.0", "112.0", "107.8", "111.5", tf="1m"),
    ]
    strat = Ml03FirstNy5mStrategy()
    ctx = StrategyContext(
        ticker="MNQ",
        timeframe="5m",
        start=day,
        end=day,
        timezone="America/New_York",
        extra_candles={"1m": m1},
    )
    result = strat.evaluate(m5, ctx)
    assert result.signals
    assert result.signals[0].side == Side.LONG
    assert "ML03" in result.signals[0].reason
    assert result.trades
    assert result.trades[0].setup is not None
    assert result.trades[0].setup["kind"] == "ml03_first_ny5"

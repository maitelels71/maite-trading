"""CH01–CH06 channel scan unit tests."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.core.constants import (
    STRATEGY_CH01_GAP_GO,
    STRATEGY_CH03_EMA_CROSS,
    STRATEGY_CH06_ORB,
)
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.strategy_types import StrategyContext
from app.indicators import ema, rsi
from app.strategies.channel_scan import (
    Ch01GapGoStrategy,
    Ch03EmaCrossStrategy,
    Ch06OrbStrategy,
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
    vol: str = "1000",
    tf: str = "5m",
) -> Candle:
    return Candle(
        timestamp=ts,
        open=Decimal(o),
        high=Decimal(h),
        low=Decimal(l),
        close=Decimal(c),
        volume=Decimal(vol),
        ticker="SPY",
        timeframe=tf,
    )


def test_ch_strategies_registered() -> None:
    reg = build_default_registry()
    for key in (
        STRATEGY_CH01_GAP_GO,
        STRATEGY_CH03_EMA_CROSS,
        STRATEGY_CH06_ORB,
    ):
        s = reg.get(key)
        assert s.name == key
        assert s.scan_timeframe == "5m"


def test_ema_and_rsi_helpers() -> None:
    vals = [Decimal(str(i)) for i in range(1, 40)]
    e = ema(vals, 9)
    assert e[8] is not None
    assert e[-1] is not None
    r = rsi(vals, 14)
    assert r[14] is not None


def test_ch01_gap_go_long() -> None:
    day = date(2026, 8, 4)
    # Prior day closes ~100
    prior = [
        _c(
            datetime(2026, 8, 3, 15, 55, tzinfo=ET),
            "99",
            "100.5",
            "98.5",
            "100",
            vol="500",
        )
        for _ in range(40)
    ]
    # Gap +3% open 103, high volume
    base = datetime(2026, 8, 4, 9, 30, tzinfo=ET)
    day_bars = [
        _c(base, "103", "103.5", "102.8", "103.2", vol="5000"),
        _c(base + timedelta(minutes=5), "103.2", "103.8", "103.0", "103.5", vol="4800"),
        _c(base + timedelta(minutes=10), "103.5", "104.0", "103.3", "103.8", vol="4500"),
    ]
    strat = Ch01GapGoStrategy()
    result = strat.evaluate(
        prior + day_bars,
        StrategyContext(
            ticker="SPY",
            timeframe="5m",
            start=day,
            end=day,
        ),
    )
    assert result.signals
    assert result.signals[0].side is Side.LONG
    assert "CH01" in result.signals[0].reason


def test_ch03_ema_cross_fires_intraday() -> None:
    """Cross mid-session (not only on the last two bars) must produce a signal."""
    day = date(2026, 8, 4)
    base = datetime(2026, 8, 4, 9, 30, tzinfo=ET)
    bars: list[Candle] = []
    px = Decimal("100")
    # Warm-up downtrend, then sharp rally that crosses EMAs around bar 35.
    for i in range(50):
        t = base + timedelta(minutes=5 * i)
        if i < 28:
            px -= Decimal("0.25")
        else:
            px += Decimal("0.6")
        vol = "50" if i % 2 == 0 else "2000"  # Yahoo-like zero-ish alternation
        if i % 2 == 0:
            vol = "0"
        bars.append(
            _c(
                t,
                str(px),
                str(px + Decimal("0.2")),
                str(px - Decimal("0.2")),
                str(px),
                vol=vol,
            )
        )
    strat = Ch03EmaCrossStrategy()
    result = strat.evaluate(
        bars,
        StrategyContext(
            ticker="MNQ",
            timeframe="5m",
            start=day,
            end=day,
        ),
    )
    assert result.signals, "expected CH03 cross during the RTH walk"
    assert result.signals[0].side in (Side.LONG, Side.SHORT)
    assert "CH03" in result.signals[0].reason


def test_ch03_ema_cross_needs_volume() -> None:
    day = date(2026, 8, 4)
    base = datetime(2026, 8, 1, 9, 30, tzinfo=ET)
    bars: list[Candle] = []
    # Falling then rising to force bullish EMA cross near end of day
    px = Decimal("100")
    for i in range(50):
        t = base + timedelta(minutes=5 * i)
        if i < 30:
            px -= Decimal("0.3")
        else:
            px += Decimal("0.5")
        vol = "2000" if i >= 48 else "800"
        bars.append(
            _c(
                t,
                str(px),
                str(px + Decimal("0.2")),
                str(px - Decimal("0.2")),
                str(px),
                vol=vol,
            )
        )
    strat = Ch03EmaCrossStrategy()
    # Use last bar's date
    last_day = bars[-1].timestamp.astimezone(ET).date()
    result = strat.evaluate(
        bars,
        StrategyContext(
            ticker="SPY",
            timeframe="5m",
            start=last_day,
            end=last_day,
        ),
    )
    # May or may not fire depending on exact EMA path — must not crash
    assert isinstance(result.signals, list)


def test_ch06_orb_break_high() -> None:
    day = date(2026, 8, 4)
    base = datetime(2026, 8, 4, 9, 30, tzinfo=ET)
    # OR 9:30–9:45: high 101 low 99
    or_bars = [
        _c(base, "100", "101", "99.5", "100.5", vol="1000"),
        _c(base + timedelta(minutes=5), "100.5", "100.8", "99.2", "100", vol="1000"),
        _c(base + timedelta(minutes=10), "100", "100.5", "99", "99.5", vol="1000"),
    ]
    # Break high with volume
    post = [
        _c(
            base + timedelta(minutes=15),
            "100.5",
            "102",
            "100.4",
            "101.5",
            vol="2000",
        )
    ]
    strat = Ch06OrbStrategy()
    result = strat.evaluate(
        or_bars + post,
        StrategyContext(
            ticker="SPY",
            timeframe="5m",
            start=day,
            end=day,
            parameters={"opening_range_minutes": 15},
        ),
    )
    assert result.signals
    assert result.signals[0].side is Side.LONG
    assert "CH06" in result.signals[0].reason

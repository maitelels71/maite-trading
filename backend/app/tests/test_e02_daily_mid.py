"""E02 daily mid bounce unit tests."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.strategy_types import StrategyContext
from app.strategies.daily_mid_bounce import DailyMidBounceStrategy

ET = ZoneInfo("America/New_York")


def _c(
    ts: datetime,
    o: str,
    h: str,
    l: str,
    c: str,
    *,
    tf: str,
) -> Candle:
    return Candle(
        timestamp=ts,
        open=Decimal(o),
        high=Decimal(h),
        low=Decimal(l),
        close=Decimal(c),
        volume=Decimal("1000"),
        ticker="SPY",
        timeframe=tf,
    )


def _next_weekday(day: datetime) -> datetime:
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


def _daily_trend(start: datetime, n: int, px: Decimal, step: Decimal) -> list[Candle]:
    out: list[Candle] = []
    day = _next_weekday(start)
    for _ in range(n):
        day = _next_weekday(day)
        nxt = px + step
        hi = max(px, nxt) + Decimal("0.3")
        lo = min(px, nxt) - Decimal("0.3")
        ts = day.replace(hour=16, minute=0, second=0, microsecond=0)
        out.append(_c(ts, str(px), str(hi), str(lo), str(nxt), tf="1d"))
        px = nxt
        day = day + timedelta(days=1)
    return out


def _hora_pullback_then_bounce(
    start: datetime,
    *,
    n_days: int,
    start_px: Decimal,
    step: Decimal,
    session: datetime,
    confirm_open: Decimal,
    confirm_close: Decimal,
) -> list[Candle]:
    out: list[Candle] = []
    px = start_px
    day = _next_weekday(start)
    hours = [(9, 30), (10, 0), (11, 0), (12, 0), (13, 0), (14, 0), (15, 0)]
    for _ in range(n_days):
        day = _next_weekday(day)
        if day.date() >= session.date():
            break
        for hh, mm in hours:
            ts = day.replace(hour=hh, minute=mm, second=0, microsecond=0)
            nxt = px + step
            hi = max(px, nxt) + Decimal("0.15")
            lo = min(px, nxt) - Decimal("0.15")
            out.append(_c(ts, str(px), str(hi), str(lo), str(nxt), tf="1h"))
            px = nxt
        day = day + timedelta(days=1)

    # Session confirm bar
    ts = session.replace(hour=10, minute=0, second=0, microsecond=0)
    hi = max(confirm_open, confirm_close) + Decimal("0.2")
    lo = min(confirm_open, confirm_close) - Decimal("0.2")
    out.append(
        _c(ts, str(confirm_open), str(hi), str(lo), str(confirm_close), tf="1h")
    )
    return out


def test_e02_call_proxy() -> None:
    start = datetime(2025, 11, 3, tzinfo=ET)
    session = datetime(2026, 1, 6, tzinfo=ET)
    d1 = _daily_trend(start, 40, Decimal("80"), Decimal("0.4"))
    # last daily close ~96; mid rising. Pull Hora down into mid then bounce.
    h1 = _hora_pullback_then_bounce(
        datetime(2025, 12, 1, tzinfo=ET),
        n_days=20,
        start_px=Decimal("105"),
        step=Decimal("-0.25"),
        session=session,
        confirm_open=Decimal("94"),
        confirm_close=Decimal("96.5"),
    )
    result = DailyMidBounceStrategy().evaluate(
        h1,
        StrategyContext(
            ticker="SPY",
            timeframe="1h",
            start=start,
            end=session,
            extra_candles={"1d": d1, "15m": []},
            parameters={
                "min_daily_mid_change_pct": 0.001,
                "touch_pct": 0.05,
            },
        ),
    )
    assert any(s.side is Side.LONG for s in result.signals), result
    assert "E02 CALL" in result.signals[0].reason


def test_e02_put_proxy() -> None:
    start = datetime(2025, 11, 3, tzinfo=ET)
    session = datetime(2026, 1, 6, tzinfo=ET)
    d1 = _daily_trend(start, 40, Decimal("120"), Decimal("-0.4"))
    h1 = _hora_pullback_then_bounce(
        datetime(2025, 12, 1, tzinfo=ET),
        n_days=20,
        start_px=Decimal("90"),
        step=Decimal("0.25"),
        session=session,
        confirm_open=Decimal("106"),
        confirm_close=Decimal("103.5"),
    )
    result = DailyMidBounceStrategy().evaluate(
        h1,
        StrategyContext(
            ticker="SPY",
            timeframe="1h",
            start=start,
            end=session,
            extra_candles={"1d": d1, "15m": []},
            parameters={
                "min_daily_mid_change_pct": 0.001,
                "touch_pct": 0.05,
            },
        ),
    )
    assert any(s.side is Side.SHORT for s in result.signals), result


def test_e02_no_signal_without_daily() -> None:
    session = datetime(2026, 1, 6, tzinfo=ET)
    h1 = _hora_pullback_then_bounce(
        datetime(2025, 12, 15, tzinfo=ET),
        n_days=10,
        start_px=Decimal("100"),
        step=Decimal("-0.1"),
        session=session,
        confirm_open=Decimal("99"),
        confirm_close=Decimal("100"),
    )
    result = DailyMidBounceStrategy().evaluate(
        h1,
        StrategyContext(
            ticker="SPY",
            timeframe="1h",
            start=session,
            end=session,
            extra_candles={},
        ),
    )
    assert result.signals == []

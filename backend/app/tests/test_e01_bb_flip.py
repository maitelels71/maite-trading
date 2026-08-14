"""E01 BB Hora trend-flip unit tests."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.strategy_types import StrategyContext
from app.strategies.bb_trend_flip_h import BbTrendFlipHStrategy

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


def _hora_series(
    start: datetime,
    *,
    n_days: int,
    start_px: Decimal,
    step: Decimal,
    stop_before: datetime | None = None,
) -> list[Candle]:
    out: list[Candle] = []
    px = start_px
    day = _next_weekday(start)
    hours = [(9, 30), (10, 0), (11, 0), (12, 0), (13, 0), (14, 0), (15, 0)]
    for _ in range(n_days):
        day = _next_weekday(day)
        if stop_before and day.date() >= stop_before.date():
            break
        for hh, mm in hours:
            ts = day.replace(hour=hh, minute=mm, second=0, microsecond=0)
            nxt = px + step
            hi = max(px, nxt) + Decimal("0.2")
            lo = min(px, nxt) - Decimal("0.2")
            out.append(_c(ts, str(px), str(hi), str(lo), str(nxt), tf="1h"))
            px = nxt
        day = day + timedelta(days=1)
    return out


def _m15_slope(session: datetime, start_px: Decimal, step: Decimal) -> list[Candle]:
    out: list[Candle] = []
    px = start_px
    t0 = session.replace(hour=9, minute=30, second=0, microsecond=0)
    for i in range(8):
        ts = t0 + timedelta(minutes=15 * i)
        nxt = px + step
        hi = max(px, nxt) + Decimal("0.05")
        lo = min(px, nxt) - Decimal("0.05")
        out.append(_c(ts, str(px), str(hi), str(lo), str(nxt), tf="15m"))
        px = nxt
    return out


def test_e01_call_proxy_mid_break() -> None:
    start = datetime(2025, 12, 8, tzinfo=ET)
    session = datetime(2026, 1, 6, tzinfo=ET)
    h1 = _hora_series(
        start, n_days=15, start_px=Decimal("110"), step=Decimal("-0.4"), stop_before=session
    )
    # Flip bar: open near lows, close well through lagged BB mid
    flip = session.replace(hour=11, minute=0, second=0, microsecond=0)
    last = h1[-1].close
    h1.append(
        _c(
            flip,
            str(last),
            str(last + Decimal("8")),
            str(last - Decimal("0.2")),
            str(last + Decimal("7")),
            tf="1h",
        )
    )
    m15 = _m15_slope(session, last, Decimal("0.15"))

    result = BbTrendFlipHStrategy().evaluate(
        h1,
        StrategyContext(
            ticker="SPY",
            timeframe="1h",
            start=start,
            end=session,
            extra_candles={"15m": m15},
            parameters={"min_mid_change_pct": 0.002, "min_body_pct": 0.001},
        ),
    )
    assert any(s.side is Side.LONG for s in result.signals), result
    assert "E01 CALL" in result.signals[0].reason
    assert len(result.trades) == 1
    assert result.trades[0].side is Side.LONG
    assert result.metrics.total_trades == 1


def test_e01_put_proxy_mid_break() -> None:
    start = datetime(2025, 12, 8, tzinfo=ET)
    session = datetime(2026, 1, 6, tzinfo=ET)
    h1 = _hora_series(
        start, n_days=15, start_px=Decimal("90"), step=Decimal("0.4"), stop_before=session
    )
    flip = session.replace(hour=11, minute=0, second=0, microsecond=0)
    last = h1[-1].close
    h1.append(
        _c(
            flip,
            str(last),
            str(last + Decimal("0.2")),
            str(last - Decimal("8")),
            str(last - Decimal("7")),
            tf="1h",
        )
    )
    m15 = _m15_slope(session, last, Decimal("-0.15"))

    result = BbTrendFlipHStrategy().evaluate(
        h1,
        StrategyContext(
            ticker="SPY",
            timeframe="1h",
            start=start,
            end=session,
            extra_candles={"15m": m15},
            parameters={"min_mid_change_pct": 0.002, "min_body_pct": 0.001},
        ),
    )
    assert any(s.side is Side.SHORT for s in result.signals), result


def test_e01_call_invalidated_when_later_hora_closes_back_below_mid() -> None:
    """Morning flip must not stay as a live match after Hora loses the mid."""
    start = datetime(2025, 12, 8, tzinfo=ET)
    session = datetime(2026, 1, 6, tzinfo=ET)
    h1 = _hora_series(
        start, n_days=15, start_px=Decimal("110"), step=Decimal("-0.4"), stop_before=session
    )
    last = h1[-1].close
    flip = session.replace(hour=10, minute=0, second=0, microsecond=0)
    fade = session.replace(hour=11, minute=0, second=0, microsecond=0)
    h1.append(
        _c(
            flip,
            str(last),
            str(last + Decimal("8")),
            str(last - Decimal("0.2")),
            str(last + Decimal("7")),
            tf="1h",
        )
    )
    # Next Hora dumps back below any reasonable mid
    h1.append(
        _c(
            fade,
            str(last + Decimal("7")),
            str(last + Decimal("7.2")),
            str(last - Decimal("5")),
            str(last - Decimal("4")),
            tf="1h",
        )
    )
    m15 = _m15_slope(session, last, Decimal("0.15"))
    # Append fading 15m closes below open of afternoon
    t_fade = session.replace(hour=11, minute=0, second=0, microsecond=0)
    px = m15[-1].close
    for i in range(4):
        ts = t_fade + timedelta(minutes=15 * i)
        nxt = px - Decimal("1.5")
        m15.append(_c(ts, str(px), str(px), str(nxt), str(nxt), tf="15m"))
        px = nxt

    result = BbTrendFlipHStrategy().evaluate(
        h1,
        StrategyContext(
            ticker="AAPL",
            timeframe="1h",
            start=start,
            end=session,
            extra_candles={"15m": m15},
            parameters={"min_mid_change_pct": 0.002, "min_body_pct": 0.001},
        ),
    )
    assert result.signals == [], result


def test_e01_no_signal_flat_prior() -> None:
    start = datetime(2025, 12, 15, tzinfo=ET)
    session = datetime(2026, 1, 6, tzinfo=ET)
    h1 = _hora_series(
        start, n_days=10, start_px=Decimal("100"), step=Decimal("0.01"), stop_before=session
    )
    flip = session.replace(hour=11, minute=0, second=0, microsecond=0)
    h1.append(_c(flip, "100", "101", "99.8", "100.8", tf="1h"))
    result = BbTrendFlipHStrategy().evaluate(
        h1,
        StrategyContext(
            ticker="SPY",
            timeframe="1h",
            start=start,
            end=session,
            extra_candles={"15m": []},
            parameters={"min_mid_change_pct": 0.01},
        ),
    )
    assert result.signals == []

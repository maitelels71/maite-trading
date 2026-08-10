"""E03 magnet MA20 gap unit tests."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.strategy_types import StrategyContext
from app.strategies.magnet_ma20_gap import MagnetMa20GapStrategy

ET = ZoneInfo("America/New_York")


def _c(
    ts: datetime,
    o: str,
    h: str,
    l: str,
    c: str,
    *,
    tf: str,
    vol: str = "1000",
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
) -> list[Candle]:
    out: list[Candle] = []
    px = start_px
    day = _next_weekday(start)
    hours = [(9, 30), (10, 0), (11, 0), (12, 0), (13, 0), (14, 0), (15, 0)]
    for _ in range(n_days):
        day = _next_weekday(day)
        for hh, mm in hours:
            ts = day.replace(hour=hh, minute=mm, second=0, microsecond=0)
            nxt = px + step
            hi = max(px, nxt) + Decimal("0.2")
            lo = min(px, nxt) - Decimal("0.2")
            out.append(_c(ts, str(px), str(hi), str(lo), str(nxt), tf="1h"))
            px = nxt
        day = day + timedelta(days=1)
    return out


def _m15_flat(start: datetime, n_days: int, px: Decimal) -> list[Candle]:
    out: list[Candle] = []
    day = _next_weekday(start)
    for _ in range(n_days):
        day = _next_weekday(day)
        t0 = day.replace(hour=9, minute=30, second=0, microsecond=0)
        for i in range(26):
            ts = t0 + timedelta(minutes=15 * i)
            out.append(
                _c(
                    ts,
                    str(px),
                    str(px + Decimal("0.05")),
                    str(px - Decimal("0.05")),
                    str(px),
                    tf="15m",
                )
            )
        day = day + timedelta(days=1)
    return out


def test_e03_put_proxy_on_bull_gap() -> None:
    start = datetime(2025, 12, 15, tzinfo=ET)
    h1 = _hora_series(start, n_days=12, start_px=Decimal("90"), step=Decimal("0.35"))
    session = datetime(2026, 1, 6, tzinfo=ET)
    m15 = _m15_flat(datetime(2025, 12, 22, tzinfo=ET), 8, Decimal("100"))
    m15 = [c for c in m15 if c.timestamp.astimezone(ET).date() < session.date()]
    gap = session.replace(hour=9, minute=30, second=0, microsecond=0)
    m15.append(_c(gap, "125", "126", "124.5", "125.2", tf="15m", vol="5000"))

    result = MagnetMa20GapStrategy().evaluate(
        m15,
        StrategyContext(
            ticker="SPY",
            timeframe="15m",
            start=start,
            end=session,
            extra_candles={"1h": h1},
            parameters={"min_gap_from_ma20_pct": 0.005, "min_ma_sep_pct": 0.001},
        ),
    )
    assert any(s.side is Side.SHORT for s in result.signals), result
    assert "E03 PUT" in result.signals[0].reason


def test_e03_call_proxy_on_bear_gap() -> None:
    start = datetime(2025, 12, 15, tzinfo=ET)
    h1 = _hora_series(start, n_days=12, start_px=Decimal("110"), step=Decimal("-0.35"))
    session = datetime(2026, 1, 6, tzinfo=ET)
    m15 = _m15_flat(datetime(2025, 12, 22, tzinfo=ET), 8, Decimal("100"))
    m15 = [c for c in m15 if c.timestamp.astimezone(ET).date() < session.date()]
    gap = session.replace(hour=9, minute=30, second=0, microsecond=0)
    m15.append(_c(gap, "80", "80.5", "79", "79.8", tf="15m"))

    result = MagnetMa20GapStrategy().evaluate(
        m15,
        StrategyContext(
            ticker="SPY",
            timeframe="15m",
            start=start,
            end=session,
            extra_candles={"1h": h1},
            parameters={"min_gap_from_ma20_pct": 0.005, "min_ma_sep_pct": 0.001},
        ),
    )
    assert any(s.side is Side.LONG for s in result.signals), result


def test_e03_no_signal_without_1h() -> None:
    session = datetime(2026, 1, 6, tzinfo=ET)
    m15 = _m15_flat(datetime(2025, 12, 29, tzinfo=ET), 3, Decimal("100"))
    result = MagnetMa20GapStrategy().evaluate(
        m15,
        StrategyContext(
            ticker="SPY",
            timeframe="15m",
            start=session,
            end=session,
            extra_candles={},
        ),
    )
    assert result.signals == []

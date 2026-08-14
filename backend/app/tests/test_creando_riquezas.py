"""Smoke tests for Creando Riquezas gap / first-red setups."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.strategy_types import StrategyContext
from app.strategies.creando_riquezas import (
    Cr04GapUpGreenStrategy,
    Cr05GapDownGreenStrategy,
    Cr08FirstRedStrategy,
)

ET = ZoneInfo("America/New_York")


def _c(ts: datetime, o: str, h: str, l: str, c: str, *, tf: str = "1h") -> Candle:
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


def test_cr04_gap_up_two_green() -> None:
    prior = datetime(2026, 1, 5, 15, 0, tzinfo=ET)
    session = datetime(2026, 1, 6, tzinfo=ET)
    h1 = [
        _c(prior, "100", "101", "99", "100.5"),
        _c(session.replace(hour=9, minute=30), "101.5", "102", "101.2", "101.8"),
        _c(session.replace(hour=10, minute=0), "101.8", "103", "101.7", "102.5"),
    ]
    result = Cr04GapUpGreenStrategy().evaluate(
        h1,
        StrategyContext(
            ticker="SPY",
            timeframe="1h",
            start=session,
            end=session,
            parameters={"min_gap_pct": 0.002},
        ),
    )
    assert any(s.side is Side.LONG for s in result.signals)


def test_cr05_gap_down_two_green() -> None:
    prior = datetime(2026, 1, 5, 15, 0, tzinfo=ET)
    session = datetime(2026, 1, 6, tzinfo=ET)
    h1 = [
        _c(prior, "100", "101", "99", "100"),
        _c(session.replace(hour=9, minute=30), "98.5", "99.2", "98.2", "99"),
        _c(session.replace(hour=10, minute=0), "99", "100", "98.9", "99.8"),
    ]
    result = Cr05GapDownGreenStrategy().evaluate(
        h1,
        StrategyContext(
            ticker="SPY",
            timeframe="1h",
            start=session,
            end=session,
            parameters={"min_gap_pct": 0.002},
        ),
    )
    assert any(s.side is Side.LONG for s in result.signals)


def test_cr08_first_red() -> None:
    session = datetime(2026, 1, 6, tzinfo=ET)
    # Build fake daily far from MA200
    d1 = []
    day = datetime(2025, 6, 2, 16, 0, tzinfo=ET)
    px = Decimal("80")
    for _ in range(220):
        while day.weekday() >= 5:
            day += timedelta(days=1)
        nxt = px + Decimal("0.2")
        d1.append(_c(day, str(px), str(nxt + 1), str(px - 1), str(nxt), tf="1d"))
        px = nxt
        day += timedelta(days=1)

    # True CR08 bar = 9:30–10:00 30m red; 10:00 green must NOT drive the signal
    m30 = [
        _c(
            session.replace(hour=9, minute=30),
            "120",
            "120.5",
            "118",
            "118.5",
            tf="30m",
        ),
        _c(
            session.replace(hour=10, minute=0),
            "118.5",
            "122",
            "118.4",
            "121.5",
            tf="30m",
        ),
    ]
    result = Cr08FirstRedStrategy().evaluate(
        m30,
        StrategyContext(
            ticker="SPY",
            timeframe="30m",
            start=session,
            end=session,
            extra_candles={"1d": d1},
        ),
    )
    assert any(s.side is Side.SHORT for s in result.signals)


def test_cr08_ignores_green_open_even_if_10am_red() -> None:
    """Regression: clock-hour 1h used to treat 10:00 as 'first RTH'."""
    session = datetime(2026, 1, 6, tzinfo=ET)
    d1 = []
    day = datetime(2025, 6, 2, 16, 0, tzinfo=ET)
    px = Decimal("80")
    for _ in range(220):
        while day.weekday() >= 5:
            day += timedelta(days=1)
        nxt = px + Decimal("0.2")
        d1.append(_c(day, str(px), str(nxt + 1), str(px - 1), str(nxt), tf="1d"))
        px = nxt
        day += timedelta(days=1)

    m30 = [
        _c(
            session.replace(hour=9, minute=30),
            "120",
            "123",
            "119.5",
            "122.5",
            tf="30m",
        ),  # green open
        _c(
            session.replace(hour=10, minute=0),
            "122.5",
            "122.6",
            "118",
            "118.5",
            tf="30m",
        ),  # red 10:00
    ]
    result = Cr08FirstRedStrategy().evaluate(
        m30,
        StrategyContext(
            ticker="TSLA",
            timeframe="30m",
            start=session,
            end=session,
            extra_candles={"1d": d1},
        ),
    )
    assert result.signals == []

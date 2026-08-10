"""E04 BB15 gap-open strategy unit tests."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.strategy_types import StrategyContext
from app.strategies.bb15_gap_open import Bb15GapOpenStrategy

ET = ZoneInfo("America/New_York")


def _bar(day: datetime, hour: int, minute: int, o: str, h: str, l: str, c: str) -> Candle:
    ts = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return Candle(
        timestamp=ts,
        open=Decimal(o),
        high=Decimal(h),
        low=Decimal(l),
        close=Decimal(c),
        volume=Decimal("1000"),
        ticker="SPY",
        timeframe="15m",
    )


def _rth_day(day: datetime, close: str = "100") -> list[Candle]:
    """26 RTH 15m bars with nearly flat prices (squeeze-friendly)."""
    bars: list[Candle] = []
    px = Decimal(close)
    start = day.replace(hour=9, minute=30, second=0, microsecond=0)
    for i in range(26):
        ts = start + timedelta(minutes=15 * i)
        # tiny noise so stdev ~0
        bars.append(
            Candle(
                timestamp=ts,
                open=px,
                high=px + Decimal("0.05"),
                low=px - Decimal("0.05"),
                close=px,
                volume=Decimal("1000"),
                ticker="SPY",
                timeframe="15m",
            )
        )
    return bars


def test_e04_call_proxy_signal() -> None:
    prior = datetime(2026, 1, 5, tzinfo=ET)  # Monday
    today = datetime(2026, 1, 6, tzinfo=ET)
    candles = _rth_day(prior, "100") + _rth_day(datetime(2026, 1, 2, tzinfo=ET), "100")
    # Rebuild: need enough warm-up — use Fri + Mon prior, Tue gap
    fri = datetime(2026, 1, 2, tzinfo=ET)
    mon = datetime(2026, 1, 5, tzinfo=ET)
    tue = datetime(2026, 1, 6, tzinfo=ET)
    candles = _rth_day(fri, "100") + _rth_day(mon, "100")
    # Gap down fully below lower + rising close
    candles.append(_bar(tue, 9, 30, "96", "96.5", "95.5", "96.4"))

    strategy = Bb15GapOpenStrategy()
    result = strategy.evaluate(
        candles,
        StrategyContext(
            ticker="SPY",
            timeframe="15m",
            start=fri,
            end=tue,
            parameters={
                "lateral_max_mid_change_pct": 0.01,
                "squeeze_max_bandwidth": 0.05,
            },
        ),
    )
    assert any(s.side is Side.LONG for s in result.signals)
    assert "E04 CALL" in result.signals[0].reason


def test_e04_put_proxy_signal() -> None:
    fri = datetime(2026, 1, 2, tzinfo=ET)
    mon = datetime(2026, 1, 5, tzinfo=ET)
    tue = datetime(2026, 1, 6, tzinfo=ET)
    candles = _rth_day(fri, "100") + _rth_day(mon, "100")
    candles.append(_bar(tue, 9, 30, "104", "104.5", "103.5", "103.6"))

    strategy = Bb15GapOpenStrategy()
    result = strategy.evaluate(
        candles,
        StrategyContext(
            ticker="SPY",
            timeframe="15m",
            start=fri,
            end=tue,
            parameters={
                "lateral_max_mid_change_pct": 0.01,
                "squeeze_max_bandwidth": 0.05,
            },
        ),
    )
    assert any(s.side is Side.SHORT for s in result.signals)


def test_e04_no_signal_without_gap() -> None:
    fri = datetime(2026, 1, 2, tzinfo=ET)
    mon = datetime(2026, 1, 5, tzinfo=ET)
    tue = datetime(2026, 1, 6, tzinfo=ET)
    candles = _rth_day(fri, "100") + _rth_day(mon, "100")
    candles.append(_bar(tue, 9, 30, "100", "100.2", "99.8", "100.1"))

    strategy = Bb15GapOpenStrategy()
    result = strategy.evaluate(
        candles,
        StrategyContext(ticker="SPY", timeframe="15m", start=fri, end=tue),
    )
    assert result.signals == []

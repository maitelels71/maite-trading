"""ML01 structure ChoCh/BOS unit tests."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.core.constants import STRATEGY_ML01_STRUCTURE
from app.domain.candles import Candle
from app.domain.strategy_types import StrategyContext
from app.strategies.ml01_structure_choch_bos import (
    Ml01StructureChochBosStrategy,
    _major_bias,
)
from app.strategies.registry import build_default_registry

ET = ZoneInfo("America/New_York")


def _c(ts: datetime, o: str, h: str, l: str, c: str, *, tf: str = "1h") -> Candle:
    return Candle(
        timestamp=ts,
        open=Decimal(o),
        high=Decimal(h),
        low=Decimal(l),
        close=Decimal(c),
        volume=Decimal("100"),
        ticker="NQ",
        timeframe=tf,
    )


def test_ml01_registered() -> None:
    reg = build_default_registry()
    s = reg.get(STRATEGY_ML01_STRUCTURE)
    assert s.name == STRATEGY_ML01_STRUCTURE
    assert s.scan_timeframe == "1h"
    assert "5m" in s.scan_extra_timeframes


def test_major_bias_bull_after_hh_break() -> None:
    """Explicit swing HH then later close above it → bull."""
    base = datetime(2026, 8, 3, 10, 0, tzinfo=ET)
    # Flat-ish then clear swing high at index 5, pullback, then close above HH
    pattern = [
        # 0-2 rising into swing
        ("100", "101", "99", "100.5"),
        ("100.5", "102", "100", "101.5"),
        ("101.5", "103", "101", "102.5"),
        ("102.5", "104", "102", "103"),
        ("103", "105", "102.5", "104"),
        # 5 = swing high (peak 110), then lower
        ("104", "110", "103", "108"),
        ("108", "109", "104", "105"),
        ("105", "106", "102", "103"),
        ("103", "104", "100", "101"),
        ("101", "102", "99", "100"),
        # break HH 110
        ("100", "112", "99", "111"),
    ]
    candles = [
        _c(base + timedelta(hours=i), *vals) for i, vals in enumerate(pattern)
    ]
    bias, note = _major_bias(candles, left=2, right=2)
    assert bias == "bull", note


def test_ml01_evaluate_runs() -> None:
    base = datetime(2026, 8, 3, 9, 30, tzinfo=ET)
    h1: list[Candle] = []
    px = Decimal("100")
    for i in range(30):
        ts = base + timedelta(hours=i)
        step = Decimal("1") if i < 15 else Decimal("-0.5")
        nxt = px + step
        h1.append(
            _c(
                ts,
                str(px),
                str(max(px, nxt) + 1),
                str(min(px, nxt) - 1),
                str(nxt),
            )
        )
        px = nxt

    m15: list[Candle] = []
    px = Decimal("100")
    for i in range(40):
        ts = base + timedelta(minutes=15 * i)
        step = Decimal("0.3") if i > 20 else Decimal("-0.2")
        nxt = px + step
        m15.append(
            _c(
                ts,
                str(px),
                str(max(px, nxt) + Decimal("0.2")),
                str(min(px, nxt) - Decimal("0.2")),
                str(nxt),
                tf="15m",
            )
        )
        px = nxt

    strat = Ml01StructureChochBosStrategy()
    ctx = StrategyContext(
        ticker="NQ",
        timeframe="1h",
        start=date(2026, 8, 4),
        end=date(2026, 8, 4),
        timezone="America/New_York",
        extra_candles={"5m": m15},
    )
    result = strat.evaluate(h1, ctx)
    assert isinstance(result.signals, list)
    assert isinstance(result.trades, list)

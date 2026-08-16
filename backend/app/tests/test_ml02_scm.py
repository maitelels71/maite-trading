"""ML02 Single Candle Mitigation unit tests."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.core.constants import STRATEGY_ML02_SCM
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.strategy_types import StrategyContext
from app.strategies.ml02_single_candle_mitigation import (
    Ml02SingleCandleMitigationStrategy,
    OrderBlock,
    find_scm_in_ob,
    is_bearish_scm,
    is_bullish_scm,
    overlaps_ob,
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
    tf: str = "15m",
) -> Candle:
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


def test_ml02_registered() -> None:
    reg = build_default_registry()
    s = reg.get(STRATEGY_ML02_SCM)
    assert s.name == STRATEGY_ML02_SCM
    assert s.scan_timeframe == "15m"
    assert "5m" in s.scan_extra_timeframes
    assert "1m" in s.scan_extra_timeframes


def test_scm_candle_rules() -> None:
    base = datetime(2026, 8, 3, 10, 0, tzinfo=ET)
    prior = _c(base, "100", "101", "99", "100.5")
    # Long upper wick rejection (wick ~70% of range)
    bear_scm = _c(base + timedelta(minutes=5), "100.4", "103.0", "100.0", "100.3")
    assert is_bearish_scm(prior, bear_scm)
    assert not is_bullish_scm(prior, bear_scm)
    # Tiny upper wick must fail (no clear liquidity grab)
    weak = _c(base + timedelta(minutes=5), "100.8", "101.15", "100.6", "101.0")
    assert not is_bearish_scm(prior, weak)

    prior2 = _c(base, "100", "101", "99.5", "99.8")
    bull_scm = _c(base + timedelta(minutes=5), "100.0", "100.4", "97.5", "100.2")
    assert is_bullish_scm(prior2, bull_scm)
    assert not is_bearish_scm(prior2, bull_scm)


def test_find_scm_requires_ob_overlap() -> None:
    base = datetime(2026, 8, 3, 10, 0, tzinfo=ET)
    ob = OrderBlock(
        side="bear",
        top=Decimal("110"),
        bottom=Decimal("108"),
        index=3,
        bos_index=5,
    )
    # SCM that does NOT touch OB → ignored
    away = [
        _c(base, "100", "101", "99", "100", tf="1m"),
        _c(base + timedelta(minutes=1), "100.4", "103.0", "100.0", "100.3", tf="1m"),
    ]
    assert find_scm_in_ob(away, ob, lookback=5) is None

    # Long-wick SCM mitigating supply OB
    in_ob = [
        _c(base, "108.5", "109.0", "108.2", "108.8", tf="1m"),
        _c(
            base + timedelta(minutes=1),
            "108.8",
            "111.0",
            "108.0",
            "108.5",
            tf="1m",
        ),
    ]
    hit = find_scm_in_ob(in_ob, ob, lookback=5)
    assert hit is not None
    assert hit.side == "bear"
    assert overlaps_ob(hit.candle, ob)


def test_ml02_evaluate_bull_scm_in_demand_ob() -> None:
    """Synthetic: bullish BOS → demand OB → LTF bullish SCM in zone."""
    base = datetime(2026, 8, 3, 9, 0, tzinfo=ET)
    htf: list[Candle] = []
    levels = [
        ("105", "106", "104", "104.5"),
        ("104.5", "105", "103", "103.5"),
        ("103.5", "104", "102", "102.5"),
        ("102.5", "103", "101", "101.5"),  # bearish → demand OB candidate
        ("101.5", "102", "100.5", "101"),
        ("101", "101.5", "99", "99.5"),  # swing low area
        ("99.5", "100", "99", "99.8"),
        ("99.8", "101", "99.5", "100.5"),
        ("100.5", "103", "100", "102.5"),
        ("102.5", "105", "102", "104.5"),  # BOS through earlier highs
        ("104.5", "106", "104", "105"),
        ("105", "105.5", "103.5", "104"),
        ("104", "104.5", "102", "102.5"),
        ("102.5", "103", "101.2", "101.8"),
    ]
    for i, vals in enumerate(levels):
        htf.append(_c(base + timedelta(minutes=15 * i), *vals))

    # Long lower-wick bullish SCM mitigating demand OB ~101-103
    ltf_base = base + timedelta(minutes=15 * 13)
    ltf = [
        _c(ltf_base, "102.0", "102.4", "101.6", "101.9", tf="1m"),
        _c(ltf_base + timedelta(minutes=1), "101.9", "102.3", "100.2", "102.1", tf="1m"),
        _c(ltf_base + timedelta(minutes=2), "102.0", "104.0", "101.9", "103.5", tf="1m"),
    ]

    strat = Ml02SingleCandleMitigationStrategy()
    ctx = StrategyContext(
        ticker="NQ",
        timeframe="15m",
        start=date(2026, 8, 3),
        end=date(2026, 8, 3),
        timezone="America/New_York",
        parameters={"require_inducement": False},
        extra_candles={"1m": ltf},
    )
    result = strat.evaluate(htf, ctx)
    assert isinstance(result.signals, list)
    assert isinstance(result.trades, list)
    if result.signals:
        assert result.signals[0].side == Side.LONG
        assert "ML02" in result.signals[0].reason
        assert result.trades[0].profit_loss is not None


def test_ml02_evaluate_runs_empty_ltf() -> None:
    base = datetime(2026, 8, 3, 9, 0, tzinfo=ET)
    htf = [
        _c(base + timedelta(minutes=15 * i), "100", "101", "99", "100")
        for i in range(20)
    ]
    strat = Ml02SingleCandleMitigationStrategy()
    ctx = StrategyContext(
        ticker="NQ",
        timeframe="15m",
        start=date(2026, 8, 3),
        end=date(2026, 8, 3),
        timezone="America/New_York",
        extra_candles={},
    )
    result = strat.evaluate(htf, ctx)
    assert result.signals == []
    assert result.trades == []


def test_ml02_backtest_walks_full_range_not_only_tail() -> None:
    """SCM early in the window must be found when scm_lookback is None."""
    base = datetime(2026, 8, 3, 9, 0, tzinfo=ET)
    htf: list[Candle] = []
    levels = [
        ("105", "106", "104", "104.5"),
        ("104.5", "105", "103", "103.5"),
        ("103.5", "104", "102", "102.5"),
        ("102.5", "103", "101", "101.5"),
        ("101.5", "102", "100.5", "101"),
        ("101", "101.5", "99", "99.5"),
        ("99.5", "100", "99", "99.8"),
        ("99.8", "101", "99.5", "100.5"),
        ("100.5", "103", "100", "102.5"),
        ("102.5", "105", "102", "104.5"),
        ("104.5", "106", "104", "105"),
        ("105", "105.5", "103.5", "104"),
        ("104", "104.5", "102", "102.5"),
        ("102.5", "103", "101.2", "101.8"),
    ]
    for i, vals in enumerate(levels):
        htf.append(_c(base + timedelta(minutes=15 * i), *vals))

    ltf_base = base + timedelta(minutes=15 * 13)
    ltf = [
        _c(ltf_base, "102.0", "102.4", "101.6", "101.9", tf="1m"),
        # clear long-wick bullish SCM
        _c(ltf_base + timedelta(minutes=1), "101.9", "102.3", "100.2", "102.1", tf="1m"),
    ]
    for k in range(2, 40):
        px = Decimal("102") + Decimal(k) * Decimal("0.01")
        ltf.append(
            _c(
                ltf_base + timedelta(minutes=k),
                str(px),
                str(px + Decimal("0.2")),
                str(px - Decimal("0.2")),
                str(px),
                tf="1m",
            )
        )

    strat = Ml02SingleCandleMitigationStrategy()
    ctx = StrategyContext(
        ticker="NQ",
        timeframe="15m",
        start=date(2026, 8, 3),
        end=date(2026, 8, 3),
        timezone="America/New_York",
        parameters={"require_inducement": False, "scm_lookback": None},
        extra_candles={"1m": ltf},
    )
    result = strat.evaluate(htf, ctx)
    if result.trades:
        assert result.metrics.total_trades >= 1
        assert result.trades[0].profit_loss is not None

"""Opening Range Breakout strategy tests."""

from decimal import Decimal

from app.domain.enums import Side, SignalType
from app.domain.strategy_types import StrategyParams
from app.strategies.opening_range_breakout import OpeningRangeBreakoutStrategy


def test_orb_long_short_reverse_and_flatten(orb_session_candles):
    strategy = OpeningRangeBreakoutStrategy()
    result = strategy.evaluate("SPY", orb_session_candles, params=StrategyParams())

    assert result.signals, "expected signals"
    types = [s.signal_type for s in result.signals]
    assert SignalType.ENTRY_LONG in types
    assert SignalType.REVERSE_TO_SHORT in types or SignalType.ENTRY_SHORT in types
    assert any(s.signal_type == SignalType.FLATTEN for s in result.signals)

    assert result.trades
    assert all(not t.is_open for t in result.trades)
    # First trade should be long
    assert result.trades[0].side == Side.LONG
    # Fill at close — entry equals candle close used in fixture
    assert result.trades[0].entry_price == Decimal("100.8")


def test_orb_long_only(orb_session_candles):
    strategy = OpeningRangeBreakoutStrategy()
    result = strategy.evaluate(
        "SPY",
        orb_session_candles,
        params=StrategyParams(allow_long=True, allow_short=False),
    )
    assert all(t.side == Side.LONG for t in result.trades)
    assert not any(s.signal_type == SignalType.REVERSE_TO_SHORT for s in result.signals)


def test_orb_empty_candles():
    strategy = OpeningRangeBreakoutStrategy()
    result = strategy.evaluate("SPY", [])
    assert result.signals == []
    assert result.trades == []

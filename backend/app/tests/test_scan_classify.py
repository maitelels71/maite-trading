"""Live desk scan classification (premarket vs older sessions)."""

from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.api.strategy import _classify_scan_result
from app.domain.enums import Side
from app.domain.signals import Signal
from app.domain.strategy_types import StrategyResult
from app.domain.trades import Trade

ET = ZoneInfo("America/New_York")


def _result() -> StrategyResult:
    ts = datetime(2026, 8, 18, 10, 0, tzinfo=ET)
    sig = Signal(
        timestamp=ts,
        side=Side.SHORT,
        price=Decimal("100"),
        reason="E01 flip",
        ticker="SPY",
    )
    trade = Trade(
        side=Side.SHORT,
        entry_time=ts,
        entry_price=Decimal("100"),
        signal="E01 flip",
        exit_time=datetime(2026, 8, 18, 16, 0, tzinfo=ET),
        exit_price=Decimal("99"),
        profit_loss=Decimal("1"),
    )
    return StrategyResult(signals=[sig], trades=[trade])


def test_premarket_yesterday_session_stays_a_match() -> None:
    status, matched, _, signal, _ = _classify_scan_result(
        _result(),
        session_day=date(2026, 8, 18),
    )
    assert matched is True
    assert signal is not None
    assert status.startswith("signal_")


def test_older_than_scanned_session_is_not_a_match() -> None:
    _, matched, _, _, _ = _classify_scan_result(
        _result(),
        session_day=date(2026, 8, 19),
    )
    assert matched is False

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app.domain.session_calendar import (
    is_cash_rth,
    is_globex_open,
    live_candle_range_end,
    resolve_operative_session_date,
)

ET = ZoneInfo("America/New_York")


def test_monday_preopen_uses_friday() -> None:
    now = datetime(2026, 8, 10, 6, 58, tzinfo=ET)
    assert resolve_operative_session_date(now).isoformat() == "2026-08-07"


def test_monday_after_open_uses_today() -> None:
    now = datetime(2026, 8, 10, 9, 30, tzinfo=ET)
    assert resolve_operative_session_date(now).isoformat() == "2026-08-10"


def test_saturday_uses_friday() -> None:
    now = datetime(2026, 8, 8, 12, 0, tzinfo=ET)
    assert resolve_operative_session_date(now).isoformat() == "2026-08-07"


def test_sunday_uses_friday() -> None:
    now = datetime(2026, 8, 9, 18, 0, tzinfo=ET)
    assert resolve_operative_session_date(now).isoformat() == "2026-08-07"


def test_futures_sunday_before_globex_still_friday() -> None:
    now = datetime(2026, 8, 16, 17, 59, tzinfo=ET)
    assert is_globex_open(now) is False
    assert (
        resolve_operative_session_date(now, market="futures").isoformat()
        == "2026-08-14"
    )


def test_futures_sunday_globex_open_uses_sunday() -> None:
    now = datetime(2026, 8, 16, 18, 0, tzinfo=ET)
    assert is_globex_open(now) is True
    assert (
        resolve_operative_session_date(now, market="futures").isoformat()
        == "2026-08-16"
    )


def test_futures_monday_pre_rth_uses_monday() -> None:
    now = datetime(2026, 8, 17, 7, 49, tzinfo=ET)
    assert is_globex_open(now) is True
    assert (
        resolve_operative_session_date(now, market="futures").isoformat()
        == "2026-08-17"
    )
    # Cash desk still waits for 9:30
    assert resolve_operative_session_date(now).isoformat() == "2026-08-14"


def test_cash_rth_weekday_window() -> None:
    assert is_cash_rth(datetime(2026, 8, 17, 9, 29, tzinfo=ET)) is False
    assert is_cash_rth(datetime(2026, 8, 17, 9, 30, tzinfo=ET)) is True
    assert is_cash_rth(datetime(2026, 8, 17, 15, 59, tzinfo=ET)) is True
    assert is_cash_rth(datetime(2026, 8, 17, 16, 0, tzinfo=ET)) is False
    assert is_cash_rth(datetime(2026, 8, 15, 12, 0, tzinfo=ET)) is False  # Saturday


def test_futures_friday_after_globex_close_keeps_friday() -> None:
    now = datetime(2026, 8, 14, 17, 30, tzinfo=ET)
    assert is_globex_open(now) is False
    assert (
        resolve_operative_session_date(now, market="futures").isoformat()
        == "2026-08-14"
    )


def test_futures_candle_end_extends_after_utc_midnight() -> None:
    """8:30pm ET in summer is already the next UTC day — include those bars."""
    scan = date(2026, 8, 18)
    now = datetime(2026, 8, 19, 0, 30, tzinfo=UTC)
    end = live_candle_range_end(scan, market="futures", now=now)
    assert end == datetime(2026, 8, 19, 0, 30)


def test_cash_candle_end_stays_scan_day_utc() -> None:
    scan = date(2026, 8, 18)
    now = datetime(2026, 8, 19, 0, 30, tzinfo=UTC)
    end = live_candle_range_end(scan, market="cash", now=now)
    assert end == datetime(2026, 8, 18, 23, 59, 59)


def test_futures_candle_end_during_rth_stays_scan_day_utc() -> None:
    scan = date(2026, 8, 18)
    now = datetime(2026, 8, 18, 19, 0, tzinfo=UTC)  # 3pm ET
    end = live_candle_range_end(scan, market="futures", now=now)
    assert end == datetime(2026, 8, 18, 23, 59, 59)

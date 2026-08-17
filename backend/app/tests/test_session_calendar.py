from datetime import datetime
from zoneinfo import ZoneInfo

from app.domain.session_calendar import (
    is_globex_open,
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


def test_futures_friday_after_globex_close_keeps_friday() -> None:
    now = datetime(2026, 8, 14, 17, 30, tzinfo=ET)
    assert is_globex_open(now) is False
    assert (
        resolve_operative_session_date(now, market="futures").isoformat()
        == "2026-08-14"
    )

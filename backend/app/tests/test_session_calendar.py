from datetime import datetime
from zoneinfo import ZoneInfo

from app.domain.session_calendar import resolve_operative_session_date

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

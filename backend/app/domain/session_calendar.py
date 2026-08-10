"""NY cash-session helpers for live scan defaults."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
# Regular cash equity open; before this we treat "today" as not yet operative.
RTH_OPEN = time(9, 30)


def previous_weekday(day: date) -> date:
    """Skip Sat/Sun; does not account for market holidays."""
    d = day - timedelta(days=1)
    while d.weekday() >= 5:  # Sat=5, Sun=6
        d -= timedelta(days=1)
    return d


def resolve_operative_session_date(now: datetime | None = None) -> date:
    """Last / current NY cash session for live scans.

    - Weekday at/after 09:30 ET → today (session in progress or done)
    - Weekday before 09:30 ET → previous weekday (last completed session)
    - Weekend → previous Friday

    Holidays are not calendared yet; callers still get a weekday.
    """
    ts = now.astimezone(ET) if now is not None else datetime.now(ET)
    today = ts.date()
    if today.weekday() >= 5:
        return previous_weekday(today)
    if ts.timetz().replace(tzinfo=None) < RTH_OPEN:
        return previous_weekday(today)
    return today

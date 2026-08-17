"""NY session helpers for live scan defaults (cash RTH vs CME Globex)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
# Regular cash equity open; before this we treat "today" as not yet operative.
RTH_OPEN = time(9, 30)
# CME Globex: weekly open Sunday 18:00 ET, weekly close Friday 17:00 ET.
# Weekday maintenance halt 17:00–18:00 ET.
GLOBEX_REOPEN = time(18, 0)
GLOBEX_HALT = time(17, 0)

MarketCalendar = Literal["cash", "futures"]


def previous_weekday(day: date) -> date:
    """Skip Sat/Sun; does not account for market holidays."""
    d = day - timedelta(days=1)
    while d.weekday() >= 5:  # Sat=5, Sun=6
        d -= timedelta(days=1)
    return d


def is_globex_open(now: datetime | None = None) -> bool:
    """True while CME equity-index / FX / metals Globex is in the weekly session."""
    ts = now.astimezone(ET) if now is not None else datetime.now(ET)
    wd = ts.weekday()  # Mon=0 … Sun=6
    clock = ts.timetz().replace(tzinfo=None)
    if wd == 5:  # Saturday
        return False
    if wd == 6:  # Sunday
        return clock >= GLOBEX_REOPEN
    if wd == 4:  # Friday
        return clock < GLOBEX_HALT
    # Mon–Thu: closed only during the daily 17:00–18:00 halt
    return not (GLOBEX_HALT <= clock < GLOBEX_REOPEN)


def resolve_operative_session_date(
    now: datetime | None = None,
    *,
    market: MarketCalendar = "cash",
) -> date:
    """Last / current NY session for live scans.

    Cash (equities/options):
    - Weekday at/after 09:30 ET → today
    - Weekday before 09:30 ET → previous weekday
    - Weekend → previous Friday

    Futures (CME Globex):
    - Sunday 18:00 ET through Friday 17:00 ET → NY calendar date of ``now``
      (Sunday night after the open is Sunday, not last Friday)
    - Friday 17:00 ET until Sunday 18:00 ET → Friday (last Globex day)
    - Mon–Thu 17:00–18:00 halt → still today

    Holidays are not calendared yet.
    """
    ts = now.astimezone(ET) if now is not None else datetime.now(ET)
    today = ts.date()
    if market == "futures":
        if is_globex_open(ts):
            return today
        wd = today.weekday()
        if wd == 4:  # Friday after 17:00 — session just ended
            return today
        if wd >= 5:  # Sat / Sun before 18:00
            return previous_weekday(today)
        # Mon–Thu daily halt: keep today's Globex date
        return today

    if today.weekday() >= 5:
        return previous_weekday(today)
    if ts.timetz().replace(tzinfo=None) < RTH_OPEN:
        return previous_weekday(today)
    return today

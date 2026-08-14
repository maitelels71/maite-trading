"""US cash-session (RTH) bar helpers — Hora alignment + completed-bar gates.

Schwab has no native 1h. Clock-hour aggregation of 30m puts the 9:30–10:00 open
into a 9:00 bucket that RTH filters drop, so ``today[0]`` became 10:00–11:00.
Session-aligned Hora bars keep: 9:30–10:00, 10:00–11:00, …, 15:00–16:00.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.domain.candles import Candle

RTH_OPEN = time(9, 30)
RTH_CLOSE = time(16, 0)
HOUR_10 = time(10, 0)


def local_ts(ts: datetime, tz: ZoneInfo) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=tz)
    return ts.astimezone(tz)


def hora_bucket_start(ts: datetime, tz: ZoneInfo) -> datetime | None:
    """
    Map a bar timestamp to its RTH Hora bucket start, or None if outside RTH.

    Buckets: [9:30–10:00), [10:00–11:00), …, [15:00–16:00).
    """
    lt = local_ts(ts, tz)
    t = lt.time()
    if t < RTH_OPEN or t >= RTH_CLOSE:
        return None
    if t < HOUR_10:
        return lt.replace(hour=9, minute=30, second=0, microsecond=0)
    return lt.replace(minute=0, second=0, microsecond=0)


def hora_bar_minutes(bar: Candle, tz: ZoneInfo) -> int:
    """First Hora is a half-hour (9:30–10:00); later Horas are 60m."""
    t = local_ts(bar.timestamp, tz).time()
    if t == RTH_OPEN:
        return 30
    return 60


def bar_is_complete(
    bar: Candle,
    series: list[Candle],
    *,
    tz: ZoneInfo,
    bar_minutes: int | None = None,
    now: datetime | None = None,
) -> bool:
    """True if a later bar exists in ``series``, or wall-clock is past bar end."""
    bar_local = local_ts(bar.timestamp, tz)
    for c in series:
        if local_ts(c.timestamp, tz) > bar_local:
            return True
    minutes = bar_minutes if bar_minutes is not None else hora_bar_minutes(bar, tz)
    end = bar_local + timedelta(minutes=minutes)
    clock = now or datetime.now(tz)
    if clock.tzinfo is None:
        clock = clock.replace(tzinfo=tz)
    else:
        clock = clock.astimezone(tz)
    return clock >= end


def filter_completed(
    bars: list[Candle],
    series: list[Candle],
    *,
    tz: ZoneInfo,
    now: datetime | None = None,
) -> list[Candle]:
    """Keep only bars that have finished forming."""
    return [
        b
        for b in bars
        if bar_is_complete(b, series, tz=tz, now=now)
    ]

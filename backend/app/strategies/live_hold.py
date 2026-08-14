"""Live desk: drop intraday signals that already reversed after the signal bar.

Used by the Strategies scanner so stale morning setups (e.g. 10:00 flip that
faded by 11:40) do not stay as green matches. Applies to every strategy on
live session scans — not for multi-day backtests.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.rth_bars import local_ts
from app.domain.strategy_types import StrategyMetrics, StrategyResult


def drop_reversed_session_signals(
    result: StrategyResult,
    candles: list[Candle],
    *,
    session_day: date,
    timeframe: str,
    timezone: str = "America/New_York",
    now: datetime | None = None,
) -> StrategyResult:
    """
    If a later session bar (completed or still forming) has already closed through
    the signal price against the setup, clear the result so the desk does not
    show a green match.
    """
    if not result.signals or not candles:
        return result

    tf = (timeframe or "").lower()
    # Daily setups are confirmed near the close — don't kill them on midday wicks
    if tf in {"1d", "d1", "daily"}:
        return result

    tz = ZoneInfo(timezone)
    # ``now`` reserved for future window rules; price path uses latest bars
    _ = now

    today_bars = [
        c
        for c in sorted(candles, key=lambda x: x.timestamp)
        if local_ts(c.timestamp, tz).date() == session_day
    ]
    if not today_bars:
        return result

    sig = result.signals[-1]
    # Latest bar after the signal — including forming — so fades show up live
    later = [c for c in today_bars if c.timestamp > sig.timestamp]
    if not later:
        return result

    last = later[-1]
    side = sig.side
    if side is Side.LONG and last.close < sig.price:
        return StrategyResult(signals=[], trades=[], metrics=StrategyMetrics())
    if side is Side.SHORT and last.close > sig.price:
        return StrategyResult(signals=[], trades=[], metrics=StrategyMetrics())
    return result

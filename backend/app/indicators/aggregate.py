"""Aggregate lower-timeframe candles into higher buckets."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.domain.candles import Candle
from app.domain.rth_bars import hora_bucket_start


def aggregate_candles(
    candles: list[Candle],
    *,
    bucket_minutes: int,
    out_timeframe: str,
) -> list[Candle]:
    """
    Merge OHLCV into fixed-minute buckets (UTC/aware timestamps preserved).

    Bucket key = floor(timestamp to bucket_minutes). Empty input → [].
    """
    if bucket_minutes <= 0:
        raise ValueError("bucket_minutes must be > 0")
    if not candles:
        return []

    buckets: dict[datetime, list[Candle]] = defaultdict(list)
    for c in sorted(candles, key=lambda x: x.timestamp):
        buckets[_floor_ts(c.timestamp, bucket_minutes)].append(c)

    out: list[Candle] = []
    for bucket_ts in sorted(buckets):
        group = buckets[bucket_ts]
        first, last = group[0], group[-1]
        out.append(
            Candle(
                timestamp=bucket_ts,
                open=first.open,
                high=max(g.high for g in group),
                low=min(g.low for g in group),
                close=last.close,
                volume=sum((g.volume for g in group), Decimal("0")),
                ticker=first.ticker,
                timeframe=out_timeframe,
            )
        )
    return out


def aggregate_rth_hora(
    candles: list[Candle],
    *,
    timezone: str = "America/New_York",
    out_timeframe: str = "1h",
) -> list[Candle]:
    """
    Build US cash-session Hora bars from 30m (or finer) data:

      9:30–10:00, 10:00–11:00, 11:00–12:00, …, 15:00–16:00

    Timestamp = bucket start in ``timezone``. Outside-RTH bars are dropped.
    Use this for Schwab equities ``1h`` instead of clock-hour flooring (which
    hides the 9:30–10:00 open inside a discarded 9:00 bucket).
    """
    if not candles:
        return []
    tz = ZoneInfo(timezone)
    buckets: dict[datetime, list[Candle]] = defaultdict(list)
    for c in sorted(candles, key=lambda x: x.timestamp):
        key = hora_bucket_start(c.timestamp, tz)
        if key is None:
            continue
        buckets[key].append(c)

    out: list[Candle] = []
    for bucket_ts in sorted(buckets):
        group = buckets[bucket_ts]
        first, last = group[0], group[-1]
        out.append(
            Candle(
                timestamp=bucket_ts,
                open=first.open,
                high=max(g.high for g in group),
                low=min(g.low for g in group),
                close=last.close,
                volume=sum((g.volume for g in group), Decimal("0")),
                ticker=first.ticker,
                timeframe=out_timeframe,
            )
        )
    return out


def _floor_ts(ts: datetime, bucket_minutes: int) -> datetime:
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=UTC)
    # Floor to epoch minutes then bucket
    epoch = int(ts.timestamp())
    bucket_sec = bucket_minutes * 60
    floored = epoch - (epoch % bucket_sec)
    return datetime.fromtimestamp(floored, tz=UTC)

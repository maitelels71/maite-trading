"""Normalize vendor payloads into domain candles."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Mapping

from app.domain.candles import Candle
from app.domain.enums import Timeframe


def _as_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _as_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
    if isinstance(value, (int, float)):
        ts = float(value)
        if ts > 1e12:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, tz=UTC)
    text = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def normalize_candle(
    payload: Mapping[str, Any],
    *,
    ticker: str,
    timeframe: str | Timeframe,
) -> Candle:
    """
    Accept common key aliases from brokers and return a domain Candle.

    Required logical fields: timestamp/open/high/low/close (+ optional volume).
    """
    ts = payload.get("timestamp") or payload.get("datetime") or payload.get("time")
    if ts is None:
        raise ValueError("candle payload missing timestamp")

    return Candle(
        timestamp=_as_datetime(ts),
        open=_as_decimal(payload["open"]),
        high=_as_decimal(payload["high"]),
        low=_as_decimal(payload["low"]),
        close=_as_decimal(payload["close"]),
        volume=_as_decimal(payload.get("volume", 0)),
        ticker=ticker,
        timeframe=Timeframe(timeframe) if not isinstance(timeframe, Timeframe) else timeframe,
    )


def normalize_candles(
    payloads: list[Mapping[str, Any]],
    *,
    ticker: str,
    timeframe: str | Timeframe,
) -> list[Candle]:
    candles = [
        normalize_candle(row, ticker=ticker, timeframe=timeframe) for row in payloads
    ]
    return sorted(candles, key=lambda c: c.timestamp)

"""Normalize heterogeneous provider candle payloads into domain Candles."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Iterable, List, Mapping, Sequence

from app.domain.candles import Candle, sort_candles


def _to_decimal(value: Any) -> Decimal:
    return Decimal(str(value))


def _parse_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        ts = value
    elif isinstance(value, (int, float)):
        # Heuristic: ms vs seconds
        seconds = float(value) / 1000.0 if float(value) > 10_000_000_000 else float(value)
        ts = datetime.fromtimestamp(seconds, tz=timezone.utc)
    elif isinstance(value, str):
        text = value.replace("Z", "+00:00")
        ts = datetime.fromisoformat(text)
    else:
        raise ValueError(f"unsupported timestamp: {value!r}")
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


def normalize_candle_dict(
    payload: Mapping[str, Any],
    *,
    symbol: str,
    timeframe: str = "1m",
) -> Candle:
    # Common aliases across Schwab / TradeAdvocate-style payloads
    ts_key = next(k for k in ("timestamp", "datetime", "time", "dateTime", "t") if k in payload)
    open_key = next(k for k in ("open", "o", "openPrice") if k in payload)
    high_key = next(k for k in ("high", "h", "highPrice") if k in payload)
    low_key = next(k for k in ("low", "l", "lowPrice") if k in payload)
    close_key = next(k for k in ("close", "c", "closePrice") if k in payload)
    volume_key = next((k for k in ("volume", "v", "totalVolume") if k in payload), None)

    return Candle(
        symbol=symbol,
        timestamp=_parse_timestamp(payload[ts_key]),
        open=_to_decimal(payload[open_key]),
        high=_to_decimal(payload[high_key]),
        low=_to_decimal(payload[low_key]),
        close=_to_decimal(payload[close_key]),
        volume=_to_decimal(payload[volume_key]) if volume_key else Decimal("0"),
        timeframe=timeframe,
    )


def normalize_candles(
    rows: Sequence[Mapping[str, Any]] | Iterable[Mapping[str, Any]],
    *,
    symbol: str,
    timeframe: str = "1m",
) -> List[Candle]:
    candles = [normalize_candle_dict(row, symbol=symbol, timeframe=timeframe) for row in rows]
    return sort_candles(candles)

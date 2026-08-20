"""Technical indicators — pure functions over price series (no broker I/O)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from statistics import pstdev


def sma(values: Sequence[Decimal], period: int) -> list[Decimal | None]:
    """Simple moving average. Leading bars before `period` are None."""
    if period <= 0:
        raise ValueError("period must be > 0")
    out: list[Decimal | None] = [None] * len(values)
    if len(values) < period:
        return out
    window_sum = sum(values[:period], Decimal("0"))
    out[period - 1] = window_sum / period
    for i in range(period, len(values)):
        window_sum += values[i] - values[i - period]
        out[i] = window_sum / period
    return out


def ema(values: Sequence[Decimal], period: int) -> list[Decimal | None]:
    """Exponential moving average. Seeded with SMA of the first `period` bars."""
    if period <= 0:
        raise ValueError("period must be > 0")
    out: list[Decimal | None] = [None] * len(values)
    if len(values) < period:
        return out
    seed = sum(values[:period], Decimal("0")) / period
    out[period - 1] = seed
    mult = Decimal("2") / (Decimal(period) + Decimal("1"))
    prev = seed
    for i in range(period, len(values)):
        prev = (values[i] - prev) * mult + prev
        out[i] = prev
    return out


def rsi(values: Sequence[Decimal], period: int = 14) -> list[Decimal | None]:
    """Wilder RSI. Returns None until enough bars."""
    if period <= 0:
        raise ValueError("period must be > 0")
    n = len(values)
    out: list[Decimal | None] = [None] * n
    if n <= period:
        return out
    gains = Decimal("0")
    losses = Decimal("0")
    for i in range(1, period + 1):
        delta = values[i] - values[i - 1]
        if delta >= 0:
            gains += delta
        else:
            losses -= delta
    avg_gain = gains / period
    avg_loss = losses / period
    if avg_loss == 0:
        out[period] = Decimal("100")
    else:
        rs = avg_gain / avg_loss
        out[period] = Decimal("100") - (Decimal("100") / (Decimal("1") + rs))
    for i in range(period + 1, n):
        delta = values[i] - values[i - 1]
        gain = delta if delta > 0 else Decimal("0")
        loss = -delta if delta < 0 else Decimal("0")
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        if avg_loss == 0:
            out[i] = Decimal("100")
        else:
            rs = avg_gain / avg_loss
            out[i] = Decimal("100") - (Decimal("100") / (Decimal("1") + rs))
    return out


def session_vwap(candles: Sequence) -> list[Decimal | None]:
    """
    Intraday VWAP from typical price * volume.
    ``candles`` items need .high/.low/.close/.volume attributes.
    """
    out: list[Decimal | None] = [None] * len(candles)
    cum_pv = Decimal("0")
    cum_v = Decimal("0")
    for i, c in enumerate(candles):
        vol = c.volume if c.volume and c.volume > 0 else Decimal("0")
        typical = (c.high + c.low + c.close) / Decimal("3")
        cum_pv += typical * vol
        cum_v += vol
        out[i] = (cum_pv / cum_v) if cum_v > 0 else typical
    return out


@dataclass(frozen=True, slots=True)
class BollingerPoint:
    mid: Decimal | None
    upper: Decimal | None
    lower: Decimal | None
    bandwidth: Decimal | None  # (upper - lower) / mid when mid > 0


def bollinger(
    closes: Sequence[Decimal],
    *,
    period: int = 20,
    std_mult: float = 2.0,
) -> list[BollingerPoint]:
    """Bollinger Bands (SMA mid ± std_mult * population stdev)."""
    mids = sma(closes, period)
    out: list[BollingerPoint] = []
    mult = Decimal(str(std_mult))
    for i, mid in enumerate(mids):
        if mid is None:
            out.append(BollingerPoint(None, None, None, None))
            continue
        window = [float(x) for x in closes[i - period + 1 : i + 1]]
        sd = Decimal(str(pstdev(window)))
        upper = mid + mult * sd
        lower = mid - mult * sd
        bandwidth = (upper - lower) / mid if mid != 0 else None
        out.append(BollingerPoint(mid=mid, upper=upper, lower=lower, bandwidth=bandwidth))
    return out

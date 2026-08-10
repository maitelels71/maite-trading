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

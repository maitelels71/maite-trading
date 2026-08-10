"""E04 — Lateral BB15 + gap open reversion (CALL/PUT → LONG/SHORT)."""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from app.core.constants import STRATEGY_E04_BB15_GAP
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.signals import Signal
from app.domain.strategy_types import StrategyContext, StrategyMetrics, StrategyResult
from app.indicators import bollinger
from app.strategies.base import BaseStrategy

RTH_OPEN = time(9, 30)
RTH_CLOSE = time(16, 0)


class Bb15GapOpenStrategy(BaseStrategy):
    """
    E04 heuristics (v1 scan):
    1. Prior RTH session: BB mid roughly flat + narrow bandwidth (squeeze).
    2. First RTH 15m bar of scan day: fully outside prior BB band.
    3. Same bar reverts toward the mid (bullish close if below / bearish if above).

    Note: live trading uses a 5-minute entry window; with 15m bars the first RTH
    bar is the scan proxy. Manual checklist still owns ATM/spread/expiry.
    """

    @property
    def name(self) -> str:
        return STRATEGY_E04_BB15_GAP

    @property
    def description(self) -> str:
        return (
            "E04 Lateral BB15 + gap: prior-day squeeze, open fully outside bands, "
            "first 15m bar reverts toward mid (LONG=CALL / SHORT=PUT)."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "15m"

    @property
    def scan_lookback_days(self) -> int:
        return 5

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "bb_period": 20,
            "bb_std": 2.0,
            "lateral_bars": 8,
            "lateral_max_mid_change_pct": 0.004,  # 0.4% mid drift over lateral window
            "squeeze_max_bandwidth": 0.035,  # (upper-lower)/mid
            "timezone": "America/New_York",
        }

    def evaluate(
        self,
        candles: list[Candle],
        context: StrategyContext,
    ) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        bb_period = int(params["bb_period"])
        bb_std = float(params["bb_std"])
        lateral_bars = int(params["lateral_bars"])
        lateral_max = Decimal(str(params["lateral_max_mid_change_pct"]))
        squeeze_max = Decimal(str(params["squeeze_max_bandwidth"]))

        if not candles:
            return StrategyResult()

        session_day = _as_date(context.end)
        rth = [
            c
            for c in sorted(candles, key=lambda x: x.timestamp)
            if RTH_OPEN <= _local(c.timestamp, tz).time() < RTH_CLOSE
        ]
        if len(rth) < bb_period + lateral_bars:
            return StrategyResult()

        closes = [c.close for c in rth]
        bands = bollinger(closes, period=bb_period, std_mult=bb_std)

        by_day: dict[date, list[int]] = {}
        for i, c in enumerate(rth):
            d = _local(c.timestamp, tz).date()
            by_day.setdefault(d, []).append(i)

        prior_days = [d for d in sorted(by_day) if d < session_day]
        if not prior_days or session_day not in by_day:
            return StrategyResult()

        prior_idxs = by_day[prior_days[-1]]
        today_idxs = by_day[session_day]
        if len(prior_idxs) < lateral_bars or not today_idxs:
            return StrategyResult()

        lateral_idxs = prior_idxs[-lateral_bars:]
        lateral_mids = [bands[i].mid for i in lateral_idxs]
        lateral_bw = [bands[i].bandwidth for i in lateral_idxs]
        if any(m is None or b is None for m, b in zip(lateral_mids, lateral_bw)):
            return StrategyResult()

        mid0 = lateral_mids[0]
        mid1 = lateral_mids[-1]
        assert mid0 is not None and mid1 is not None
        mid_change = abs(mid1 - mid0) / mid0 if mid0 != 0 else Decimal("1")
        avg_bw = sum((b for b in lateral_bw if b is not None), Decimal("0")) / len(
            lateral_bw
        )
        if mid_change > lateral_max or avg_bw > squeeze_max:
            return StrategyResult()

        # Prior BB at last prior bar — gap measured vs this envelope
        prior_last = prior_idxs[-1]
        prior_band = bands[prior_last]
        if prior_band.upper is None or prior_band.lower is None or prior_band.mid is None:
            return StrategyResult()

        first_i = today_idxs[0]
        first = rth[first_i]
        # First RTH bar should start at/near 9:30
        first_local = _local(first.timestamp, tz)
        if first_local.time() != RTH_OPEN and first_local.hour == 9 and first_local.minute > 30:
            # Allow slight offset but reject if clearly after open window proxy
            if first_local.time() >= time(9, 45):
                return StrategyResult()

        fully_below = first.high < prior_band.lower
        fully_above = first.low > prior_band.upper
        rising = first.close > first.open
        falling = first.close < first.open

        side: Side | None = None
        reason = ""
        if fully_below and rising:
            side = Side.LONG
            reason = (
                "E04 CALL proxy: prior BB15 squeeze + first 15m fully below lower "
                "band and closing up toward mid"
            )
        elif fully_above and falling:
            side = Side.SHORT
            reason = (
                "E04 PUT proxy: prior BB15 squeeze + first 15m fully above upper "
                "band and closing down toward mid"
            )
        else:
            return StrategyResult()

        signal = Signal(
            timestamp=first.timestamp,
            side=side,
            price=first.close,
            reason=reason,
            ticker=context.ticker,
        )
        return StrategyResult(
            signals=[signal],
            trades=[],
            metrics=StrategyMetrics(),
        )


def _local(ts: datetime, tz: ZoneInfo) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=tz)
    return ts.astimezone(tz)


def _as_date(value: date | datetime) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value

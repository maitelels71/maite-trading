"""E02 — Bounce off daily Bollinger mid (CALL/PUT → LONG/SHORT)."""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal
from typing import Any, Literal
from zoneinfo import ZoneInfo

from app.core.constants import STRATEGY_E02_DAILY_MID
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.rth_bars import bar_is_complete
from app.domain.strategy_types import StrategyContext, StrategyResult
from app.indicators import bollinger
from app.strategies.backtest_utils import (
    evaluate_each_session_day,
    local_ts,
    signal_and_session_trade,
)
from app.strategies.base import BaseStrategy

RTH_OPEN = time(9, 30)
RTH_CLOSE = time(16, 0)
Trend = Literal["bull", "bear"]


class DailyMidBounceStrategy(BaseStrategy):
    """
    E02 heuristics (v1):
    1. Daily BB mid clearly trending (CALL: up / PUT: down).
    2. Hora mid opposite (pullback toward daily mid).
    3. Price near daily MA20/mid (touch window).
    4. Completed Hora candle confirms (bullish for CALL / bearish for PUT).
    15m bounce remains soft/optional — checklist still owns patience rules.

    Evaluate / scan: scores session days in [context.start, context.end].
    """

    @property
    def name(self) -> str:
        return STRATEGY_E02_DAILY_MID

    @property
    def description(self) -> str:
        return (
            "E02 Daily mid bounce: D mid trend + H pullback into MA20D + "
            "completed Hora confirm (LONG=CALL / SHORT=PUT)."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "1h"

    @property
    def scan_lookback_days(self) -> int:
        return 25

    @property
    def scan_extra_timeframes(self) -> tuple[str, ...]:
        return ("1d", "15m")

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "bb_period": 20,
            "bb_std": 2.0,
            "daily_mid_lookback": 5,
            "min_daily_mid_change_pct": 0.003,
            "touch_pct": 0.008,
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

        d1 = _rth_or_all(context.extra_candles.get("1d", []), tz, daily=True)
        h1 = _rth_or_all(candles, tz, daily=False)
        if len(d1) < bb_period + int(params["daily_mid_lookback"]) or len(h1) < bb_period:
            return StrategyResult()

        d_closes = [c.close for c in d1]
        d_bands = bollinger(d_closes, period=bb_period, std_mult=bb_std)
        h_closes = [c.close for c in h1]
        h_bands = bollinger(h_closes, period=bb_period, std_mult=bb_std)

        def score(session_day: date) -> StrategyResult | None:
            # Last daily bar strictly before session day
            d_prior_idxs = [
                i for i, c in enumerate(d1) if local_ts(c.timestamp, tz).date() < session_day
            ]
            if len(d_prior_idxs) < int(params["daily_mid_lookback"]):
                return None
            look = int(params["daily_mid_lookback"])
            mid_idxs = d_prior_idxs[-look:]
            mids = [d_bands[i].mid for i in mid_idxs]
            if any(m is None for m in mids):
                return None
            mid0, mid1 = mids[0], mids[-1]
            assert mid0 is not None and mid1 is not None
            if mid0 == 0:
                return None
            mid_chg = (mid1 - mid0) / mid0
            min_chg = Decimal(str(params["min_daily_mid_change_pct"]))
            if mid_chg >= min_chg:
                d_trend: Trend = "bull"
            elif mid_chg <= -min_chg:
                d_trend = "bear"
            else:
                return None

            daily_mid = mid1
            touch = Decimal(str(params["touch_pct"]))

            h_prior = [
                i
                for i, c in enumerate(h1)
                if local_ts(c.timestamp, tz).date() < session_day and h_bands[i].mid is not None
            ]
            if len(h_prior) < 4:
                return None
            h_mid0 = h_bands[h_prior[-4]].mid
            h_mid1 = h_bands[h_prior[-1]].mid
            assert h_mid0 is not None and h_mid1 is not None
            h_trend: Trend = "bull" if h_mid1 > h_mid0 else "bear"
            # Need opposite: CALL = D↑ H↓ · PUT = D↓ H↑
            if d_trend == "bull" and h_trend != "bear":
                return None
            if d_trend == "bear" and h_trend != "bull":
                return None

            today_h = [c for c in h1 if local_ts(c.timestamp, tz).date() == session_day]
            today_done = [c for c in today_h if bar_is_complete(c, h1, tz=tz)]
            if not today_done:
                return None
            # Prefer last *completed* Hora of the session (never the forming bar)
            bar = today_done[-1]
            dist = abs(bar.close - daily_mid) / daily_mid if daily_mid else Decimal("1")
            if dist > touch and not _crossed_mid(bar, daily_mid):
                return None

            side: Side | None = None
            reason = ""
            if d_trend == "bull" and bar.close > bar.open and bar.close >= daily_mid:
                side = Side.LONG
                reason = (
                    "E02 CALL setup: daily mid up + Hora pullback + "
                    "completed bullish Hora holding above/at MA20D"
                )
            elif d_trend == "bear" and bar.close < bar.open and bar.close <= daily_mid:
                side = Side.SHORT
                reason = (
                    "E02 PUT setup: daily mid down + Hora rally + "
                    "completed bearish Hora holding below/at MA20D"
                )
            else:
                return None

            return signal_and_session_trade(
                bar=bar,
                side=side,
                reason=reason,
                ticker=context.ticker,
                day_bars=today_h,
            )

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=h1, score_day=score
        )


def _crossed_mid(bar: Candle, mid: Decimal) -> bool:
    return bar.low <= mid <= bar.high


def _rth_or_all(candles: list[Candle], tz: ZoneInfo, *, daily: bool) -> list[Candle]:
    rows = sorted(candles, key=lambda x: x.timestamp)
    if daily:
        return rows
    return [
        c
        for c in rows
        if RTH_OPEN <= local_ts(c.timestamp, tz).time() < RTH_CLOSE
    ]

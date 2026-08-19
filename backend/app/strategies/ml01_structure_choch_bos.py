"""ML01 — Major 1H structure bias + 15m ChoCh/BOS entry (futures)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

from app.core.constants import STRATEGY_ML01_STRUCTURE
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.strategy_types import StrategyContext, StrategyResult
from app.strategies.backtest_utils import (
    evaluate_each_session_day,
    local_ts,
    signal_and_session_trade,
)
from app.strategies.base import BaseStrategy

Bias = Literal["bull", "bear", "range"]


def _swing_highs(candles: list[Candle], left: int = 2, right: int = 2) -> list[int]:
    out: list[int] = []
    n = len(candles)
    for i in range(left, n - right):
        hi = candles[i].high
        if all(hi > candles[i - j].high for j in range(1, left + 1)) and all(
            hi >= candles[i + j].high for j in range(1, right + 1)
        ):
            out.append(i)
    return out


def _swing_lows(candles: list[Candle], left: int = 2, right: int = 2) -> list[int]:
    out: list[int] = []
    n = len(candles)
    for i in range(left, n - right):
        lo = candles[i].low
        if all(lo < candles[i - j].low for j in range(1, left + 1)) and all(
            lo <= candles[i + j].low for j in range(1, right + 1)
        ):
            out.append(i)
    return out


def _major_bias(h1: list[Candle], *, left: int, right: int) -> tuple[Bias, str]:
    """
    User major rule:
    - bull only after last swing HH is broken by a later close
    - bear after last relevant HL is broken (ChoCh) without a newer HH reclaim
    - else range
    """
    if len(h1) < left + right + 5:
        return "range", "insufficient_1h"

    highs = _swing_highs(h1, left, right)
    lows = _swing_lows(h1, left, right)
    if not highs:
        return "range", "no_swing_highs"

    last_hh_i = highs[-1]
    last_hh = h1[last_hh_i].high
    last_close = h1[-1].close

    hl_before_hh = [i for i in lows if i < last_hh_i]
    if hl_before_hh:
        choch_hl = h1[hl_before_hh[-1]].low
        last_hl_i = hl_before_hh[-1]
    elif lows:
        choch_hl = h1[lows[-1]].low
        last_hl_i = lows[-1]
    else:
        prior = h1[: last_hh_i + 1]
        choch_hl = min(c.low for c in prior)
        last_hl_i = min(range(last_hh_i + 1), key=lambda i: h1[i].low)

    broke_hh = any(c.close > last_hh for c in h1[last_hh_i + 1 :])
    broke_hl = any(
        c.close < choch_hl for c in h1[max(last_hh_i, last_hl_i) + 1 :]
    )

    if broke_hh and last_close > choch_hl:
        return "bull", f"broke_hh@{last_hh}"
    if broke_hl and not broke_hh:
        return "bear", f"choch_hl@{choch_hl}"
    if last_close > last_hh:
        return "bull", f"above_hh@{last_hh}"
    if last_close < choch_hl:
        return "bear", f"below_hl@{choch_hl}"
    return "range", f"between_hl_hh:{choch_hl}-{last_hh}"


def _ltf_choch_bos(
    m15: list[Candle],
    bias: Bias,
    *,
    left: int,
    right: int,
) -> tuple[bool, str]:
    """Detect recent ChoCh + BOS on LTF in bias direction (heuristic)."""
    if bias == "range" or len(m15) < left + right + 8:
        return False, "no_ltf"

    highs = _swing_highs(m15, left, right)
    lows = _swing_lows(m15, left, right)
    if len(highs) < 2 or len(lows) < 2:
        return False, "few_swings"

    window = m15[-96:]
    w_highs = _swing_highs(window, left=1, right=1)
    w_lows = _swing_lows(window, left=1, right=1)
    if not w_highs or not w_lows:
        return False, "no_window_swings"

    if bias == "bull":
        lh_i = w_highs[-1]
        lh = window[lh_i].high
        after = window[lh_i + 1 :]
        choch = any(c.close > lh for c in after)
        if not choch:
            return False, f"no_choch_lh@{lh}"
        post = [c for c in after if c.close > lh]
        if len(post) < 2:
            return False, "choch_only"
        peak = max(c.high for c in post[:-1]) if len(post) > 1 else post[0].high
        bos = post[-1].close > peak or window[-1].close > lh
        return bos, f"bull_choch_bos@{lh}"

    hl_i = w_lows[-1]
    hl = window[hl_i].low
    after = window[hl_i + 1 :]
    choch = any(c.close < hl for c in after)
    if not choch:
        return False, f"no_choch_hl@{hl}"
    post = [c for c in after if c.close < hl]
    if len(post) < 2:
        return False, "choch_only"
    trough = min(c.low for c in post[:-1]) if len(post) > 1 else post[0].low
    bos = post[-1].close < trough or window[-1].close < hl
    return bos, f"bear_choch_bos@{hl}"


class Ml01StructureChochBosStrategy(BaseStrategy):
    """
    ML01 heuristics (v1):

    1. 1H major bias from last HH / HL breaks (user major rule).
    2. LTF ChoCh + BOS aligned with that bias.
    3. Manual: OB/FVG/retest remains playbook checklist.

    Backtest walks each session day in [start, end] and closes at the day's
    last HTF bar. Live scan uses start=end=session_day.
    """

    @property
    def name(self) -> str:
        return STRATEGY_ML01_STRUCTURE

    @property
    def description(self) -> str:
        return (
            "ML01 structure: major 1H HH/HL bias + LTF ChoCh/BOS "
            "(3m plan; scan uses 5m/1m proxy). OB/retest = checklist."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "1h"

    @property
    def scan_lookback_days(self) -> int:
        return 20

    @property
    def scan_extra_timeframes(self) -> tuple[str, ...]:
        return ("5m", "1m")

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "swing_left": 2,
            "swing_right": 2,
            "timezone": "America/New_York",
        }

    def evaluate(
        self,
        candles: list[Candle],
        context: StrategyContext,
    ) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        left = int(params.get("swing_left") or 2)
        right = int(params.get("swing_right") or 2)

        h1 = sorted(candles, key=lambda c: c.timestamp)
        m15 = sorted(
            list(
                context.extra_candles.get("5m")
                or context.extra_candles.get("3m")
                or context.extra_candles.get("15m")
                or context.extra_candles.get("1m")
                or []
            ),
            key=lambda c: c.timestamp,
        )

        def score(session_day: date) -> StrategyResult | None:
            h1_asof = [
                c for c in h1 if local_ts(c.timestamp, tz).date() <= session_day
            ]
            h1_day = [
                c for c in h1 if local_ts(c.timestamp, tz).date() == session_day
            ]
            if len(h1_asof) < left + right + 5 or not h1_day:
                return None

            bias, bias_note = _major_bias(h1_asof, left=left, right=right)
            m15_asof = [
                c for c in m15 if local_ts(c.timestamp, tz).date() <= session_day
            ][-288:]
            aligned, ltf_note = _ltf_choch_bos(
                m15_asof,
                bias,
                left=max(1, left - 1),
                right=max(1, right - 1),
            )
            if bias not in ("bull", "bear") or not aligned:
                return None

            side = Side.LONG if bias == "bull" else Side.SHORT
            ref = h1_day[-1]
            reason = f"ML01 {bias} | {bias_note} | {ltf_note}"
            return signal_and_session_trade(
                bar=ref,
                side=side,
                reason=reason,
                ticker=context.ticker,
                day_bars=h1_day,
                notes="ML01 session snapshot — confirm HH/HL + LTF BOS on chart",
            )

        return evaluate_each_session_day(
            context,
            tz=tz,
            candles_for_days=h1,
            score_day=score,
        )

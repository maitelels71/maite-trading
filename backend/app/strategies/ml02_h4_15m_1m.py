"""ML02 — H4 bias → 15M confirm + PD → 1M confirm + PD entry."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from zoneinfo import ZoneInfo

from app.core.constants import STRATEGY_ML02_H4
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.strategy_types import StrategyContext, StrategyResult
from app.strategies.backtest_utils import (
    evaluate_each_session_day,
    local_ts,
    signal_and_session_trade,
)
from app.strategies.base import BaseStrategy

Direction = Literal["BULLISH", "BEARISH", "NEUTRAL"]
Zone = Literal["PREMIUM", "DISCOUNT", "EQUILIBRIUM"]


@dataclass(frozen=True, slots=True)
class BreakoutState:
    direction: Direction
    breakout: bool
    candle_bullish: bool
    candle_bearish: bool
    previous_three_high: Decimal | None
    previous_three_low: Decimal | None


@dataclass(frozen=True, slots=True)
class PdState:
    zone: Zone
    optimal_price: bool
    swing_high: Decimal | None
    swing_low: Decimal | None
    equilibrium: Decimal | None
    percentage: float | None


@dataclass(frozen=True, slots=True)
class MtfSnapshot:
    h4: BreakoutState
    m15: BreakoutState
    m15_pd: PdState
    m1: BreakoutState
    m1_pd: PdState
    signal: Literal["LONG", "SHORT", "WAIT"]
    confidence: int
    reasons: tuple[str, ...]


def _bullish(c: Candle) -> bool:
    return c.close > c.open


def _bearish(c: Candle) -> bool:
    return c.close < c.open


def _slice_as_of(candles: list[Candle], as_of: datetime) -> list[Candle]:
    return [c for c in candles if c.timestamp <= as_of]


def pivot_highs(candles: list[Candle], left: int = 2, right: int = 2) -> list[int]:
    out: list[int] = []
    n = len(candles)
    for i in range(left, n - right):
        hi = candles[i].high
        if all(hi > candles[i - j].high for j in range(1, left + 1)) and all(
            hi >= candles[i + j].high for j in range(1, right + 1)
        ):
            out.append(i)
    return out


def pivot_lows(candles: list[Candle], left: int = 2, right: int = 2) -> list[int]:
    out: list[int] = []
    n = len(candles)
    for i in range(left, n - right):
        lo = candles[i].low
        if all(lo < candles[i - j].low for j in range(1, left + 1)) and all(
            lo <= candles[i + j].low for j in range(1, right + 1)
        ):
            out.append(i)
    return out


def latest_swing_range(
    candles: list[Candle],
    *,
    pivot_length: int = 2,
) -> tuple[Decimal, Decimal] | None:
    """Most recent valid swing high/low pair (pivotLength on each side)."""
    if len(candles) < pivot_length * 2 + 3:
        return None
    highs = pivot_highs(candles, pivot_length, pivot_length)
    lows = pivot_lows(candles, pivot_length, pivot_length)
    if not highs or not lows:
        return None
    # Prefer the latest swing high and the latest swing low before/around it.
    hi_i = highs[-1]
    lows_before = [i for i in lows if i < hi_i]
    if lows_before:
        lo_i = lows_before[-1]
    else:
        lo_i = lows[-1]
        # If low is after high, try prior high before that low.
        highs_before = [i for i in highs if i < lo_i]
        if highs_before:
            hi_i = highs_before[-1]
    swing_high = candles[hi_i].high
    swing_low = candles[lo_i].low
    if swing_high <= swing_low:
        return None
    return swing_high, swing_low


def calculate_premium_discount(
    swing_high: Decimal,
    swing_low: Decimal,
    current_price: Decimal,
    *,
    level: float = 0.50,
) -> PdState:
    span = swing_high - swing_low
    if span <= 0:
        return PdState("EQUILIBRIUM", False, swing_high, swing_low, swing_low, 50.0)
    eq = swing_low + (span * Decimal(str(level)))
    pct = float((current_price - swing_low) / span * Decimal("100"))
    if current_price < eq:
        zone: Zone = "DISCOUNT"
    elif current_price > eq:
        zone = "PREMIUM"
    else:
        zone = "EQUILIBRIUM"
    return PdState(
        zone=zone,
        optimal_price=False,  # filled by caller for side
        swing_high=swing_high,
        swing_low=swing_low,
        equilibrium=eq,
        percentage=pct,
    )


def three_candle_breakout(
    candles: list[Candle],
    *,
    lookback: int = 3,
    use_active: bool = True,
) -> BreakoutState:
    """
    Prior lookback completed candles vs current (active or last completed).
    Breakout uses wicks; candle direction uses close vs open.
    """
    empty = BreakoutState(
        "NEUTRAL", False, False, False, None, None
    )
    if len(candles) < lookback + 1:
        return empty

    if use_active:
        current = candles[-1]
        completed = candles[:-1]
    else:
        if len(candles) < lookback + 2:
            return empty
        current = candles[-2]
        completed = candles[:-2]

    if len(completed) < lookback:
        return empty
    window = completed[-lookback:]
    prev_high = max(c.high for c in window)
    prev_low = min(c.low for c in window)
    is_bull = _bullish(current)
    is_bear = _bearish(current)
    bull_bo = current.high > prev_high and is_bull
    bear_bo = current.low < prev_low and is_bear
    if bull_bo and not bear_bo:
        direction: Direction = "BULLISH"
        breakout = True
    elif bear_bo and not bull_bo:
        direction = "BEARISH"
        breakout = True
    else:
        direction = "NEUTRAL"
        breakout = False
    return BreakoutState(
        direction=direction,
        breakout=breakout,
        candle_bullish=is_bull,
        candle_bearish=is_bear,
        previous_three_high=prev_high,
        previous_three_low=prev_low,
    )


def _pd_for_side(
    candles: list[Candle],
    *,
    side: Direction,
    pivot_length: int,
    pd_level: float,
    use_active: bool,
) -> PdState:
    series = candles if use_active or len(candles) < 2 else candles[:-1]
    if len(series) < 2:
        return PdState("EQUILIBRIUM", False, None, None, None, None)
    rng = latest_swing_range(series, pivot_length=pivot_length)
    if rng is None:
        # Fallback: last N-bar range so PD still evaluates.
        window = series[-max(8, pivot_length * 4) :]
        swing_high = max(c.high for c in window)
        swing_low = min(c.low for c in window)
        if swing_high <= swing_low:
            return PdState("EQUILIBRIUM", False, None, None, None, None)
    else:
        swing_high, swing_low = rng
    price = series[-1].close
    pd = calculate_premium_discount(
        swing_high, swing_low, price, level=pd_level
    )
    if side == "BULLISH":
        optimal = pd.zone == "DISCOUNT"
    elif side == "BEARISH":
        optimal = pd.zone == "PREMIUM"
    else:
        optimal = False
    return PdState(
        zone=pd.zone,
        optimal_price=optimal,
        swing_high=pd.swing_high,
        swing_low=pd.swing_low,
        equilibrium=pd.equilibrium,
        percentage=pd.percentage,
    )


def confidence_score(
    h4: BreakoutState,
    m15: BreakoutState,
    m15_pd: PdState,
    m1: BreakoutState,
    m1_pd: PdState,
) -> int:
    score = 0
    if h4.breakout and h4.direction in ("BULLISH", "BEARISH"):
        score += 20
    if (h4.direction == "BULLISH" and h4.candle_bullish) or (
        h4.direction == "BEARISH" and h4.candle_bearish
    ):
        score += 10
    if m15.breakout and m15.direction == h4.direction:
        score += 20
    if (m15.direction == "BULLISH" and m15.candle_bullish) or (
        m15.direction == "BEARISH" and m15.candle_bearish
    ):
        score += 10
    if m15_pd.optimal_price:
        score += 10
    if m1.breakout and m1.direction == h4.direction:
        score += 10
    if (m1.direction == "BULLISH" and m1.candle_bullish) or (
        m1.direction == "BEARISH" and m1.candle_bearish
    ):
        score += 5
    if m1_pd.optimal_price:
        score += 5
    return min(100, score)


def analyze_mtf(
    h4: list[Candle],
    m15: list[Candle],
    m1: list[Candle],
    *,
    lookback: int = 3,
    pivot_length: int = 2,
    pd_level: float = 0.50,
    use_active: bool = True,
    confidence_threshold: int = 90,
) -> MtfSnapshot:
    h4_st = three_candle_breakout(h4, lookback=lookback, use_active=use_active)
    reasons: list[str] = [f"H4={h4_st.direction}"]

    if h4_st.direction == "NEUTRAL":
        empty_bo = BreakoutState("NEUTRAL", False, False, False, None, None)
        empty_pd = PdState("EQUILIBRIUM", False, None, None, None, None)
        return MtfSnapshot(
            h4=h4_st,
            m15=empty_bo,
            m15_pd=empty_pd,
            m1=empty_bo,
            m1_pd=empty_pd,
            signal="WAIT",
            confidence=0,
            reasons=("H4=NEUTRAL — no setup",),
        )

    m15_st = three_candle_breakout(m15, lookback=lookback, use_active=use_active)
    reasons.append(f"15M={m15_st.direction}")
    if m15_st.direction != h4_st.direction or not m15_st.breakout:
        empty_pd = PdState("EQUILIBRIUM", False, None, None, None, None)
        empty_m1 = BreakoutState("NEUTRAL", False, False, False, None, None)
        conf = confidence_score(h4_st, m15_st, empty_pd, empty_m1, empty_pd)
        return MtfSnapshot(
            h4=h4_st,
            m15=m15_st,
            m15_pd=empty_pd,
            m1=empty_m1,
            m1_pd=empty_pd,
            signal="WAIT",
            confidence=conf,
            reasons=tuple(reasons + ["15M does not confirm H4"]),
        )

    m15_pd = _pd_for_side(
        m15,
        side=h4_st.direction,
        pivot_length=pivot_length,
        pd_level=pd_level,
        use_active=use_active,
    )
    reasons.append(f"15M zone={m15_pd.zone}")
    if not m15_pd.optimal_price:
        empty_m1 = BreakoutState("NEUTRAL", False, False, False, None, None)
        empty_pd = PdState("EQUILIBRIUM", False, None, None, None, None)
        conf = confidence_score(h4_st, m15_st, m15_pd, empty_m1, empty_pd)
        need = "DISCOUNT" if h4_st.direction == "BULLISH" else "PREMIUM"
        return MtfSnapshot(
            h4=h4_st,
            m15=m15_st,
            m15_pd=m15_pd,
            m1=empty_m1,
            m1_pd=empty_pd,
            signal="WAIT",
            confidence=conf,
            reasons=tuple(reasons + [f"15M not in {need}"]),
        )

    m1_st = three_candle_breakout(m1, lookback=lookback, use_active=use_active)
    reasons.append(f"1M={m1_st.direction}")
    if m1_st.direction != h4_st.direction or not m1_st.breakout:
        empty_pd = PdState("EQUILIBRIUM", False, None, None, None, None)
        conf = confidence_score(h4_st, m15_st, m15_pd, m1_st, empty_pd)
        return MtfSnapshot(
            h4=h4_st,
            m15=m15_st,
            m15_pd=m15_pd,
            m1=m1_st,
            m1_pd=empty_pd,
            signal="WAIT",
            confidence=conf,
            reasons=tuple(reasons + ["1M does not confirm H4"]),
        )

    m1_pd = _pd_for_side(
        m1,
        side=h4_st.direction,
        pivot_length=pivot_length,
        pd_level=pd_level,
        use_active=use_active,
    )
    reasons.append(f"1M zone={m1_pd.zone}")
    conf = confidence_score(h4_st, m15_st, m15_pd, m1_st, m1_pd)
    if not m1_pd.optimal_price:
        need = "DISCOUNT" if h4_st.direction == "BULLISH" else "PREMIUM"
        return MtfSnapshot(
            h4=h4_st,
            m15=m15_st,
            m15_pd=m15_pd,
            m1=m1_st,
            m1_pd=m1_pd,
            signal="WAIT",
            confidence=conf,
            reasons=tuple(reasons + [f"1M not in {need}"]),
        )

    if conf < confidence_threshold:
        return MtfSnapshot(
            h4=h4_st,
            m15=m15_st,
            m15_pd=m15_pd,
            m1=m1_st,
            m1_pd=m1_pd,
            signal="WAIT",
            confidence=conf,
            reasons=tuple(
                reasons + [f"confidence {conf} < threshold {confidence_threshold}"]
            ),
        )

    signal: Literal["LONG", "SHORT"] = (
        "LONG" if h4_st.direction == "BULLISH" else "SHORT"
    )
    reasons.append(f"FINAL {signal} conf={conf}")
    return MtfSnapshot(
        h4=h4_st,
        m15=m15_st,
        m15_pd=m15_pd,
        m1=m1_st,
        m1_pd=m1_pd,
        signal=signal,
        confidence=conf,
        reasons=tuple(reasons),
    )


def _format_reason(snap: MtfSnapshot) -> str:
    return " · ".join(snap.reasons)


class Ml02H4M15M1Strategy(BaseStrategy):
    """H4 directional bias → 15M confirm + PD → 1M confirm + PD entry."""

    @property
    def name(self) -> str:
        return STRATEGY_ML02_H4

    @property
    def description(self) -> str:
        return (
            "ML02 H4→15M→1M: H4 three-candle bias, 15M confirm + premium/discount, "
            "1M confirm + PD entry. LONG only in discount; SHORT only in premium."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "4h"

    @property
    def scan_lookback_days(self) -> int:
        return 30

    @property
    def scan_extra_timeframes(self) -> tuple[str, ...]:
        return ("15m", "1m")

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "h4_lookback": 3,
            "m15_lookback": 3,
            "m1_lookback": 3,
            "pivot_length": 2,
            "premium_discount_level": 0.50,
            "confidence_threshold": 90,
            "use_active_candle": True,
            "timezone": "America/New_York",
        }

    def evaluate(
        self,
        candles: list[Candle],
        context: StrategyContext,
    ) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        lookback = max(2, int(params.get("h4_lookback") or 3))
        pivot_length = max(1, int(params.get("pivot_length") or 2))
        pd_level = float(params.get("premium_discount_level") or 0.50)
        conf_th = int(params.get("confidence_threshold") or 90)
        use_active = bool(params.get("use_active_candle", True))

        h4 = sorted(candles, key=lambda c: c.timestamp)
        extras = context.extra_candles or {}
        m15 = sorted(list(extras.get("15m") or []), key=lambda c: c.timestamp)
        m1 = sorted(list(extras.get("1m") or []), key=lambda c: c.timestamp)
        # Allow 1h as H4 proxy only if 4h empty (should not happen when sync works).
        if len(h4) < lookback + 1 and extras.get("1h"):
            h4 = sorted(list(extras["1h"]), key=lambda c: c.timestamp)

        ticker = context.ticker

        def score_day(day: date) -> StrategyResult | None:
            # As-of: last 1m bar of the day (or last available).
            day_m1 = [
                c for c in m1 if local_ts(c.timestamp, tz).date() == day
            ]
            if not day_m1:
                day_m1 = [
                    c
                    for c in m1
                    if local_ts(c.timestamp, tz).date() <= day
                ]
            if not day_m1:
                return None
            as_of = day_m1[-1].timestamp
            snap = analyze_mtf(
                _slice_as_of(h4, as_of),
                _slice_as_of(m15, as_of),
                _slice_as_of(m1, as_of),
                lookback=lookback,
                pivot_length=pivot_length,
                pd_level=pd_level,
                use_active=use_active,
                confidence_threshold=conf_th,
            )
            if snap.signal == "WAIT":
                return None
            side = Side.LONG if snap.signal == "LONG" else Side.SHORT
            return signal_and_session_trade(
                bar=day_m1[-1],
                side=side,
                reason=_format_reason(snap),
                ticker=ticker,
                day_bars=day_m1,
                notes=f"conf={snap.confidence}",
            )

        return evaluate_each_session_day(
            context,
            tz=tz,
            candles_for_days=m1 or m15 or h4,
            score_day=score_day,
        )


# Back-compat alias while registry / imports migrate.
Ml02SingleCandleMitigationStrategy = Ml02H4M15M1Strategy

"""Creando Riquezas (CR01–CR11) — scannable heuristics for CALL/PUT setups."""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from app.core.constants import (
    STRATEGY_CR01_MA40,
    STRATEGY_CR02_DROP,
    STRATEGY_CR03_CHANNEL,
    STRATEGY_CR04_GAP_UP,
    STRATEGY_CR05_GAP_DOWN,
    STRATEGY_CR06_FLOOR,
    STRATEGY_CR07_PUT_CH,
    STRATEGY_CR08_FIRST_RED,
    STRATEGY_CR09_GAP_FLOOR,
    STRATEGY_CR10_HANGER,
    STRATEGY_CR11_EARNINGS,
)
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.rth_bars import bar_is_complete
from app.domain.strategy_types import StrategyContext, StrategyResult
from app.indicators import sma
from app.strategies.backtest_utils import (
    evaluate_each_session_day,
    local_ts,
    signal_and_session_trade,
)
from app.strategies.base import BaseStrategy

RTH_OPEN = time(9, 30)
RTH_CLOSE = time(16, 0)
HOUR_11 = time(11, 0)


def _rth(candles: list[Candle], tz: ZoneInfo) -> list[Candle]:
    return [
        c
        for c in sorted(candles, key=lambda x: x.timestamp)
        if RTH_OPEN <= local_ts(c.timestamp, tz).time() < RTH_CLOSE
    ]


def _signal(
    *,
    bar: Candle,
    side: Side,
    reason: str,
    ticker: str,
    day_bars: list[Candle],
) -> StrategyResult:
    return signal_and_session_trade(
        bar=bar,
        side=side,
        reason=reason,
        ticker=ticker,
        day_bars=day_bars,
    )


def _is_green(c: Candle) -> bool:
    return c.close > c.open


def _is_red(c: Candle) -> bool:
    return c.close < c.open


def _body_pct(c: Candle) -> Decimal:
    if c.close == 0:
        return Decimal("0")
    return abs(c.close - c.open) / c.close


def _prior_session_last(
    h1: list[Candle],
    tz: ZoneInfo,
    session_day: date,
) -> Candle | None:
    prior = [c for c in h1 if local_ts(c.timestamp, tz).date() < session_day]
    return prior[-1] if prior else None


def _today(h1: list[Candle], tz: ZoneInfo, session_day: date) -> list[Candle]:
    return [c for c in h1 if local_ts(c.timestamp, tz).date() == session_day]


def _sma_at(closes: list[Decimal], period: int, idx: int) -> Decimal | None:
    vals = sma(closes, period=period)
    if idx < 0 or idx >= len(vals):
        return None
    return vals[idx]


# ── CR01 ──────────────────────────────────────────────────────────────────────


class Cr01Ma40BounceStrategy(BaseStrategy):
    """MA20>MA40, touch MA40, then bullish break of recent descending highs."""

    @property
    def name(self) -> str:
        return STRATEGY_CR01_MA40

    @property
    def description(self) -> str:
        return "CR01 MA40 bounce: MA20>MA40, touch MA40, break recent highs (CALL)."

    @property
    def scan_timeframe(self) -> str | None:
        return "1h"

    @property
    def scan_lookback_days(self) -> int:
        return 15

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "ma_fast": 20,
            "ma_slow": 40,
            "touch_pct": 0.006,
            "min_body_pct": 0.001,
            "timezone": "America/New_York",
        }

    def evaluate(self, candles: list[Candle], context: StrategyContext) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        h1 = _rth(candles, tz)
        ma_f, ma_s = int(params["ma_fast"]), int(params["ma_slow"])
        if len(h1) < ma_s + 5:
            return StrategyResult()

        closes = [c.close for c in h1]

        def score(session_day: date) -> StrategyResult | None:
            today = _today(h1, tz, session_day)
            if not today:
                return None

            prior_idxs = [
                i for i, c in enumerate(h1) if local_ts(c.timestamp, tz).date() < session_day
            ]
            if len(prior_idxs) < ma_s:
                return None
            pi = prior_idxs[-1]
            fast = _sma_at(closes, ma_f, pi)
            slow = _sma_at(closes, ma_s, pi)
            if fast is None or slow is None or fast <= slow:
                return None

            touch = Decimal(str(params["touch_pct"]))
            recent = h1[max(0, pi - 12) : pi + 1]
            touched = any(
                slow > 0 and abs(c.low - slow) / slow <= touch for c in recent
            )
            if not touched:
                return None

            swing_high = max(c.high for c in recent[-6:])
            min_body = Decimal(str(params["min_body_pct"]))
            for bar in today:
                if not bar_is_complete(bar, h1, tz=tz):
                    continue
                if (
                    _is_green(bar)
                    and _body_pct(bar) >= min_body
                    and bar.close > swing_high
                    and local_ts(bar.timestamp, tz).time() >= HOUR_11
                ):
                    return _signal(
                        bar=bar,
                        side=Side.LONG,
                        reason="CR01 CALL: MA20>MA40 + MA40 touch + break recent highs",
                        ticker=context.ticker,
                        day_bars=today,
                    )
            return None

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=h1, score_day=score
        )


# ── CR02 ──────────────────────────────────────────────────────────────────────


class Cr02DropGreenStrategy(BaseStrategy):
    """Strong drop through MA40, then solid green hourly candle."""

    @property
    def name(self) -> str:
        return STRATEGY_CR02_DROP

    @property
    def description(self) -> str:
        return "CR02 Drop+green: deep drop past MA40 then solid green Hora (CALL)."

    @property
    def scan_timeframe(self) -> str | None:
        return "1h"

    @property
    def scan_lookback_days(self) -> int:
        return 12

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "ma_slow": 40,
            "min_drop_pct": 0.015,
            "min_body_pct": 0.002,
            "timezone": "America/New_York",
        }

    def evaluate(self, candles: list[Candle], context: StrategyContext) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        h1 = _rth(candles, tz)
        ma_s = int(params["ma_slow"])
        if len(h1) < ma_s + 8:
            return StrategyResult()

        closes = [c.close for c in h1]

        def score(session_day: date) -> StrategyResult | None:
            today = _today(h1, tz, session_day)
            if not today:
                return None

            prior = [c for c in h1 if local_ts(c.timestamp, tz).date() < session_day]
            if len(prior) < 8:
                return None
            window = prior[-10:]
            hi = max(c.high for c in window)
            lo = min(c.low for c in window)
            if hi == 0:
                return None
            drop = (hi - lo) / hi
            if drop < Decimal(str(params["min_drop_pct"])):
                return None

            pi = len(prior) - 1
            slow = _sma_at(closes, ma_s, pi)
            if slow is None or prior[-1].close >= slow:
                return None

            min_body = Decimal(str(params["min_body_pct"]))
            for bar in today:
                if not bar_is_complete(bar, h1, tz=tz):
                    continue
                if _is_green(bar) and _body_pct(bar) >= min_body:
                    return _signal(
                        bar=bar,
                        side=Side.LONG,
                        reason="CR02 CALL: strong drop past MA40 + solid green Hora",
                        ticker=context.ticker,
                        day_bars=today,
                    )
            return None

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=h1, score_day=score
        )


# ── CR03 ──────────────────────────────────────────────────────────────────────


class Cr03ChannelBreakStrategy(BaseStrategy):
    """Descending highs channel proxy → break above recent ceiling."""

    @property
    def name(self) -> str:
        return STRATEGY_CR03_CHANNEL

    @property
    def description(self) -> str:
        return "CR03 Channel break: descending highs then close above ceiling (CALL)."

    @property
    def scan_timeframe(self) -> str | None:
        return "1h"

    @property
    def scan_lookback_days(self) -> int:
        return 12

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {"lookback": 10, "min_body_pct": 0.0015, "timezone": "America/New_York"}

    def evaluate(self, candles: list[Candle], context: StrategyContext) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        h1 = _rth(candles, tz)
        look = int(params["lookback"])
        if len(h1) < look + 3:
            return StrategyResult()

        def score(session_day: date) -> StrategyResult | None:
            prior = [c for c in h1 if local_ts(c.timestamp, tz).date() < session_day]
            today = _today(h1, tz, session_day)
            if len(prior) < look or not today:
                return None

            win = prior[-look:]
            mid = len(win) // 2
            if max(c.high for c in win[:mid]) <= max(c.high for c in win[mid:]):
                return None
            ceiling = max(c.high for c in win[-5:])
            min_body = Decimal(str(params["min_body_pct"]))
            for bar in today:
                if not bar_is_complete(bar, h1, tz=tz):
                    continue
                if (
                    _is_green(bar)
                    and _body_pct(bar) >= min_body
                    and bar.close > ceiling
                    and local_ts(bar.timestamp, tz).time() >= HOUR_11
                ):
                    return _signal(
                        bar=bar,
                        side=Side.LONG,
                        reason="CR03 CALL: break descending-channel ceiling",
                        ticker=context.ticker,
                        day_bars=today,
                    )
            return None

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=h1, score_day=score
        )


# ── CR04 / CR05 ───────────────────────────────────────────────────────────────


class Cr04GapUpGreenStrategy(BaseStrategy):
    """Gap up + first two RTH hourly greens."""

    @property
    def name(self) -> str:
        return STRATEGY_CR04_GAP_UP

    @property
    def description(self) -> str:
        return "CR04 Gap up: open gap + 2 green Hora candles (CALL)."

    @property
    def scan_timeframe(self) -> str | None:
        return "1h"

    @property
    def scan_lookback_days(self) -> int:
        return 8

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {"min_gap_pct": 0.002, "timezone": "America/New_York"}

    def evaluate(self, candles: list[Candle], context: StrategyContext) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        h1 = _rth(candles, tz)

        def score(session_day: date) -> StrategyResult | None:
            return _gap_two_green_day(
                h1,
                context,
                params,
                session_day,
                gap_up=True,
                reason="CR04 CALL: gap up + verde + verde",
            )

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=h1, score_day=score
        )


class Cr05GapDownGreenStrategy(BaseStrategy):
    """Gap down + first two RTH hourly greens (exception CALL)."""

    @property
    def name(self) -> str:
        return STRATEGY_CR05_GAP_DOWN

    @property
    def description(self) -> str:
        return "CR05 Gap down reverse: open gap down + 2 green Hora (CALL)."

    @property
    def scan_timeframe(self) -> str | None:
        return "1h"

    @property
    def scan_lookback_days(self) -> int:
        return 8

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {"min_gap_pct": 0.002, "timezone": "America/New_York"}

    def evaluate(self, candles: list[Candle], context: StrategyContext) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        h1 = _rth(candles, tz)

        def score(session_day: date) -> StrategyResult | None:
            return _gap_two_green_day(
                h1,
                context,
                params,
                session_day,
                gap_up=False,
                reason="CR05 CALL: gap down + verde + verde",
            )

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=h1, score_day=score
        )


def _gap_two_green_day(
    h1: list[Candle],
    context: StrategyContext,
    params: dict[str, Any],
    session_day: date,
    *,
    gap_up: bool,
    reason: str,
) -> StrategyResult | None:
    tz = ZoneInfo(str(params.get("timezone") or context.timezone))
    today = _today(h1, tz, session_day)
    prev = _prior_session_last(h1, tz, session_day)
    if not today or prev is None or len(today) < 2:
        return None

    first, second = today[0], today[1]
    # Must be true open (9:30) + next Hora (10:00–11:00); never clock-hour 10:00 as "first"
    if local_ts(first.timestamp, tz).time() != RTH_OPEN:
        return None
    if not bar_is_complete(first, h1, tz=tz) or not bar_is_complete(second, h1, tz=tz):
        return None
    if prev.close == 0:
        return None
    gap = (first.open - prev.close) / prev.close
    min_gap = Decimal(str(params["min_gap_pct"]))
    if gap_up and gap < min_gap:
        return None
    if not gap_up and gap > -min_gap:
        return None
    if not (_is_green(first) and _is_green(second)):
        return None
    return _signal(
        bar=second,
        side=Side.LONG,
        reason=reason,
        ticker=context.ticker,
        day_bars=today,
    )


# ── CR06 ──────────────────────────────────────────────────────────────────────


class Cr06StrongFloorStrategy(BaseStrategy):
    """Daily near MA100/200 + hourly break of recent high ≥11:00."""

    @property
    def name(self) -> str:
        return STRATEGY_CR06_FLOOR

    @property
    def description(self) -> str:
        return "CR06 Strong floor: daily MA100/200 touch + Hora break ≥11 (CALL)."

    @property
    def scan_timeframe(self) -> str | None:
        return "1h"

    @property
    def scan_lookback_days(self) -> int:
        return 140

    @property
    def scan_extra_timeframes(self) -> tuple[str, ...]:
        return ("1d",)

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "ma_a": 100,
            "ma_b": 200,
            "touch_pct": 0.015,
            "timezone": "America/New_York",
        }

    def evaluate(self, candles: list[Candle], context: StrategyContext) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        d1 = sorted(context.extra_candles.get("1d", []), key=lambda x: x.timestamp)
        h1 = _rth(candles, tz)
        ma_a, ma_b = int(params["ma_a"]), int(params["ma_b"])
        if len(d1) < ma_b + 2 or len(h1) < 20:
            return StrategyResult()

        def score(session_day: date) -> StrategyResult | None:
            d_prior = [c for c in d1 if local_ts(c.timestamp, tz).date() < session_day]
            if len(d_prior) < ma_b:
                return None
            d_closes = [c.close for c in d_prior]
            i = len(d_closes) - 1
            m100 = _sma_at(d_closes, ma_a, i)
            m200 = _sma_at(d_closes, ma_b, i)
            px = d_closes[i]
            touch = Decimal(str(params["touch_pct"]))
            near = False
            for m in (m100, m200):
                if m and m > 0 and abs(px - m) / m <= touch:
                    near = True
            if not near:
                return None

            prior_h = [c for c in h1 if local_ts(c.timestamp, tz).date() < session_day]
            today = _today(h1, tz, session_day)
            if len(prior_h) < 6 or not today:
                return None
            ceiling = max(c.high for c in prior_h[-8:])
            for bar in today:
                if not bar_is_complete(bar, h1, tz=tz):
                    continue
                if (
                    _is_green(bar)
                    and bar.close > ceiling
                    and local_ts(bar.timestamp, tz).time() >= HOUR_11
                ):
                    return _signal(
                        bar=bar,
                        side=Side.LONG,
                        reason="CR06 CALL: daily MA100/200 floor + Hora ceiling break",
                        ticker=context.ticker,
                        day_bars=today,
                    )
            return None

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=h1, score_day=score
        )


# ── CR07 ──────────────────────────────────────────────────────────────────────


class Cr07PutChannelStrategy(BaseStrategy):
    """Down-channel proxy near highs + red break of bounce floor ≥11:00."""

    @property
    def name(self) -> str:
        return STRATEGY_CR07_PUT_CH

    @property
    def description(self) -> str:
        return "CR07 PUT channel: near channel top + red breaks bounce floor ≥11."

    @property
    def scan_timeframe(self) -> str | None:
        return "1h"

    @property
    def scan_lookback_days(self) -> int:
        return 12

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {"lookback": 10, "near_top_pct": 0.01, "timezone": "America/New_York"}

    def evaluate(self, candles: list[Candle], context: StrategyContext) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        h1 = _rth(candles, tz)
        look = int(params["lookback"])

        def score(session_day: date) -> StrategyResult | None:
            prior = [c for c in h1 if local_ts(c.timestamp, tz).date() < session_day]
            today = _today(h1, tz, session_day)
            if len(prior) < look or not today:
                return None

            win = prior[-look:]
            mid = len(win) // 2
            if max(c.high for c in win[:mid]) <= max(c.high for c in win[mid:]):
                return None
            top = max(c.high for c in win)
            bounce = win[-4:]
            floor = min(c.low for c in bounce)
            near = Decimal(str(params["near_top_pct"]))
            for bar in today:
                if not bar_is_complete(bar, h1, tz=tz):
                    continue
                if local_ts(bar.timestamp, tz).time() < HOUR_11:
                    continue
                if top == 0:
                    continue
                if abs(bar.high - top) / top > near and bar.open < top * (1 - near):
                    continue
                if _is_red(bar) and bar.close < floor:
                    return _signal(
                        bar=bar,
                        side=Side.SHORT,
                        reason="CR07 PUT: channel top zone + red breaks bounce floor",
                        ticker=context.ticker,
                        day_bars=today,
                    )
            return None

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=h1, score_day=score
        )


# ── CR08 ──────────────────────────────────────────────────────────────────────


class Cr08FirstRedStrategy(BaseStrategy):
    """First RTH half-hour (9:30–10:00) red → PUT at 10:00; skip if daily near MA200.

    Uses 30m bars on purpose: Schwab has no native 1h, and clock-hour aggregation
    drops the 9:30–10:00 open into a 9:00 bucket (excluded by RTH), so a naive
    ``today[0]`` on 1h was actually the **10:00–11:00** clock hour — wrong bar.
    """

    @property
    def name(self) -> str:
        return STRATEGY_CR08_FIRST_RED

    @property
    def description(self) -> str:
        return "CR08 First red open: 9:30–10:00 red 30m PUT (skip daily MA200 floor)."

    @property
    def scan_timeframe(self) -> str | None:
        return "30m"

    @property
    def scan_lookback_days(self) -> int:
        return 60

    @property
    def scan_extra_timeframes(self) -> tuple[str, ...]:
        return ("1d",)

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {"ma_floor": 200, "floor_pct": 0.02, "timezone": "America/New_York"}

    def evaluate(self, candles: list[Candle], context: StrategyContext) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        m30 = _rth(candles, tz)
        d1 = sorted(context.extra_candles.get("1d", []), key=lambda x: x.timestamp)

        def score(session_day: date) -> StrategyResult | None:
            opening = _opening_half_hour(candles, tz, session_day)
            if opening is None:
                return None
            if not _half_hour_complete(opening, candles, tz, session_day):
                return None
            if not _is_red(opening):
                return None

            d_prior = [c for c in d1 if local_ts(c.timestamp, tz).date() < session_day]
            ma_n = int(params["ma_floor"])
            if len(d_prior) >= ma_n:
                closes = [c.close for c in d_prior]
                m200 = _sma_at(closes, ma_n, len(closes) - 1)
                px = closes[-1]
                floor_pct = Decimal(str(params["floor_pct"]))
                if m200 and m200 > 0 and abs(px - m200) / m200 <= floor_pct:
                    return None

            today = _today(m30, tz, session_day)
            return _signal(
                bar=opening,
                side=Side.SHORT,
                reason="CR08 PUT: 9:30–10:00 half-hour red (not near daily MA200)",
                ticker=context.ticker,
                day_bars=today or [opening],
            )

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=m30, score_day=score
        )


def _opening_half_hour(
    candles: list[Candle],
    tz: ZoneInfo,
    session_day: date,
) -> Candle | None:
    """Exact RTH open bar (9:30 ET) — the CR08 'primera vela'."""
    for c in sorted(candles, key=lambda x: x.timestamp):
        lt = local_ts(c.timestamp, tz)
        if lt.date() == session_day and lt.time() == RTH_OPEN:
            return c
    return None


def _half_hour_complete(
    opening: Candle,
    candles: list[Candle],
    tz: ZoneInfo,
    session_day: date,
) -> bool:
    """Playbook requires the 9:30–10:00 candle fully closed before PUT at 10:00."""
    open_local = local_ts(opening.timestamp, tz)
    for c in candles:
        lt = local_ts(c.timestamp, tz)
        if lt.date() == session_day and lt > open_local:
            return True
    now = datetime.now(tz)
    if now.date() > session_day:
        return True
    if now.date() == session_day and now.time() >= time(10, 0):
        return True
    return False


# ── CR09 ──────────────────────────────────────────────────────────────────────


class Cr09GapFloorPutStrategy(BaseStrategy):
    """Gap present; red Hora closes below gap floor ≥11:00."""

    @property
    def name(self) -> str:
        return STRATEGY_CR09_GAP_FLOOR

    @property
    def description(self) -> str:
        return "CR09 Gap-floor PUT: gap day + red closes below gap low ≥11."

    @property
    def scan_timeframe(self) -> str | None:
        return "1h"

    @property
    def scan_lookback_days(self) -> int:
        return 8

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {"min_gap_pct": 0.002, "timezone": "America/New_York"}

    def evaluate(self, candles: list[Candle], context: StrategyContext) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        h1 = _rth(candles, tz)

        def score(session_day: date) -> StrategyResult | None:
            today = _today(h1, tz, session_day)
            prev = _prior_session_last(h1, tz, session_day)
            if not today or prev is None:
                return None
            first = today[0]
            if local_ts(first.timestamp, tz).time() != RTH_OPEN:
                return None
            if prev.close == 0:
                return None
            gap = abs(first.open - prev.close) / prev.close
            if gap < Decimal(str(params["min_gap_pct"])):
                return None
            # Gap floor = min(prior close, open) for up/down gaps
            gap_floor = min(prev.close, first.open)
            for bar in today:
                if not bar_is_complete(bar, h1, tz=tz):
                    continue
                if local_ts(bar.timestamp, tz).time() < HOUR_11:
                    continue
                if _is_red(bar) and bar.close < gap_floor:
                    return _signal(
                        bar=bar,
                        side=Side.SHORT,
                        reason="CR09 PUT: red breaks gap floor",
                        ticker=context.ticker,
                        day_bars=today,
                    )
            return None

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=h1, score_day=score
        )


# ── CR10 ──────────────────────────────────────────────────────────────────────


class Cr10DailyHangerStrategy(BaseStrategy):
    """Daily hanger (long upper wick) → PUT bias."""

    @property
    def name(self) -> str:
        return STRATEGY_CR10_HANGER

    @property
    def description(self) -> str:
        return "CR10 Daily hanger: long upper wick / small body (PUT)."

    @property
    def scan_timeframe(self) -> str | None:
        return "1d"

    @property
    def scan_lookback_days(self) -> int:
        return 40

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "wick_body_mult": 2.0,
            "max_body_pct": 0.008,
            "timezone": "America/New_York",
        }

    def evaluate(self, candles: list[Candle], context: StrategyContext) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        d1 = sorted(candles, key=lambda x: x.timestamp)

        def score(session_day: date) -> StrategyResult | None:
            # Prefer session day's daily bar if present, else last prior (late-day scan)
            today = [c for c in d1 if local_ts(c.timestamp, tz).date() == session_day]
            bar = today[-1] if today else None
            if bar is None:
                prior = [c for c in d1 if local_ts(c.timestamp, tz).date() < session_day]
                if not prior:
                    return None
                bar = prior[-1]
                day_bars = [bar]
            else:
                # Playbook: confirm near close (~15:55) — don't fire midday on forming daily
                now = datetime.now(tz)
                if now.date() == session_day and now.time() < time(15, 55):
                    return None
                day_bars = today

            body = abs(bar.close - bar.open)
            upper = bar.high - max(bar.open, bar.close)
            if bar.close == 0 or body == 0:
                return None
            if body / bar.close > Decimal(str(params["max_body_pct"])):
                return None
            if upper < body * Decimal(str(params["wick_body_mult"])):
                return None
            return _signal(
                bar=bar,
                side=Side.SHORT,
                reason="CR10 PUT: daily hanger (upper wick) — confirm near close",
                ticker=context.ticker,
                day_bars=day_bars,
            )

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=d1, score_day=score
        )


# ── CR11 ──────────────────────────────────────────────────────────────────────


class Cr11EarningsFloorStrategy(BaseStrategy):
    """Soft earnings watch: decline into MA100/200 — verify calendar manually."""

    @property
    def name(self) -> str:
        return STRATEGY_CR11_EARNINGS

    @property
    def description(self) -> str:
        return (
            "CR11 Earnings soft: decline into MA100/200 floor (manual earnings check)."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "1d"

    @property
    def scan_lookback_days(self) -> int:
        return 140

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "ma_a": 100,
            "ma_b": 200,
            "touch_pct": 0.02,
            "min_drop_pct": 0.04,
            "timezone": "America/New_York",
        }

    def evaluate(self, candles: list[Candle], context: StrategyContext) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        d1 = sorted(candles, key=lambda x: x.timestamp)
        ma_b = int(params["ma_b"])

        def score(session_day: date) -> StrategyResult | None:
            prior = [c for c in d1 if local_ts(c.timestamp, tz).date() <= session_day]
            if len(prior) < ma_b + 5:
                return None
            closes = [c.close for c in prior]
            i = len(closes) - 1
            m100 = _sma_at(closes, int(params["ma_a"]), i)
            m200 = _sma_at(closes, ma_b, i)
            px = closes[i]
            touch = Decimal(str(params["touch_pct"]))
            near = any(m and m > 0 and abs(px - m) / m <= touch for m in (m100, m200))
            if not near:
                return None
            look = prior[-15:]
            hi = max(c.high for c in look)
            if hi == 0 or (hi - px) / hi < Decimal(str(params["min_drop_pct"])):
                return None
            bar = prior[-1]
            day_bars = [c for c in d1 if local_ts(c.timestamp, tz).date() == session_day]
            return _signal(
                bar=bar,
                side=Side.LONG,
                reason=(
                    "CR11 soft CALL bias: decline into MA100/200 — "
                    "verify earnings calendar / OptionSlam before entry"
                ),
                ticker=context.ticker,
                day_bars=day_bars or [bar],
            )

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=d1, score_day=score
        )


ALL_CR_STRATEGIES: tuple[BaseStrategy, ...] = (
    Cr01Ma40BounceStrategy(),
    Cr02DropGreenStrategy(),
    Cr03ChannelBreakStrategy(),
    Cr04GapUpGreenStrategy(),
    Cr05GapDownGreenStrategy(),
    Cr06StrongFloorStrategy(),
    Cr07PutChannelStrategy(),
    Cr08FirstRedStrategy(),
    Cr09GapFloorPutStrategy(),
    Cr10DailyHangerStrategy(),
    Cr11EarningsFloorStrategy(),
)

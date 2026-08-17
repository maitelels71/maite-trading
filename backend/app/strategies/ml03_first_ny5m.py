"""ML03 — First NY 5m candle levels + 1m FVG break/retest engulfing."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal
from zoneinfo import ZoneInfo

from app.core.constants import STRATEGY_ML03_FIRST_NY5
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.signals import Signal
from app.domain.strategy_types import StrategyContext, StrategyResult
from app.domain.trades import Trade
from app.strategies.backtest_utils import metrics_from_trades
from app.strategies.base import BaseStrategy

Bias = Literal["bull", "bear"]

RTH_OPEN = time(9, 30)
RTH_CLOSE = time(16, 0)
FIRST_5M_END = time(9, 35)


@dataclass(frozen=True, slots=True)
class FirstCandleRange:
    day: date
    high: Decimal
    low: Decimal
    open: Decimal
    close: Decimal
    timestamp: datetime


@dataclass(frozen=True, slots=True)
class FvgGap:
    side: Bias
    top: Decimal
    bottom: Decimal
    form_index: int  # index of 3rd candle that created the gap


def _local(ts: datetime, tz: ZoneInfo) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=tz)
    return ts.astimezone(tz)


def _bullish(c: Candle) -> bool:
    return c.close >= c.open


def _bearish(c: Candle) -> bool:
    return c.close < c.open


def is_bullish_engulfing(prior: Candle, curr: Candle) -> bool:
    """Curr body engulfs prior body to the upside (buy confirmation)."""
    if not _bullish(curr):
        return False
    prior_top = max(prior.open, prior.close)
    prior_bot = min(prior.open, prior.close)
    curr_top = max(curr.open, curr.close)
    curr_bot = min(curr.open, curr.close)
    return curr_bot <= prior_bot and curr_top >= prior_top and curr_top > prior_top


def is_bearish_engulfing(prior: Candle, curr: Candle) -> bool:
    """Curr body engulfs prior body to the downside (sell confirmation)."""
    if not _bearish(curr):
        return False
    prior_top = max(prior.open, prior.close)
    prior_bot = min(prior.open, prior.close)
    curr_top = max(curr.open, curr.close)
    curr_bot = min(curr.open, curr.close)
    return curr_top >= prior_top and curr_bot <= prior_bot and curr_bot < prior_bot


def find_first_ny_5m(
    candles_5m: list[Candle],
    *,
    day: date,
    tz: ZoneInfo,
) -> FirstCandleRange | None:
    """RTH first 5m candle: bar whose local open is 09:30 ET."""
    for c in sorted(candles_5m, key=lambda x: x.timestamp):
        loc = _local(c.timestamp, tz)
        if loc.date() != day:
            continue
        if loc.time() == RTH_OPEN:
            return FirstCandleRange(
                day=day,
                high=c.high,
                low=c.low,
                open=c.open,
                close=c.close,
                timestamp=c.timestamp,
            )
    return None


def detect_break_fvg(
    ltf: list[Candle],
    *,
    level: Decimal,
    side: Bias,
    start_index: int,
) -> FvgGap | None:
    """
    After price breaks ``level``, require a 3-candle FVG (gap between wicks),
    not a mere wick poke or single close.
    """
    n = len(ltf)
    for i in range(max(start_index, 2), n):
        a, _, c = ltf[i - 2], ltf[i - 1], ltf[i]
        if side == "bull":
            if max(a.high, ltf[i - 1].high, c.high) <= level:
                continue
            if a.high < c.low:
                if c.low > level or (a.high <= level < c.low):
                    return FvgGap(
                        side="bull",
                        top=c.low,
                        bottom=a.high,
                        form_index=i,
                    )
        else:
            if min(a.low, ltf[i - 1].low, c.low) >= level:
                continue
            if a.low > c.high:
                if c.high < level or (c.high < level <= a.low):
                    return FvgGap(
                        side="bear",
                        top=a.low,
                        bottom=c.high,
                        form_index=i,
                    )
    return None


def fvg_retested(c: Candle, fvg: FvgGap) -> bool:
    return c.low <= fvg.top and c.high >= fvg.bottom


def _close_trade(
    *,
    side: Bias,
    entry: Candle,
    ltf: list[Candle],
    entry_index: int,
    sl: Decimal,
    tp: Decimal,
    tz: ZoneInfo,
) -> tuple[datetime, Decimal, Decimal]:
    for j in range(entry_index + 1, len(ltf)):
        bar = ltf[j]
        loc = _local(bar.timestamp, tz).time()
        if loc >= RTH_CLOSE:
            pnl = (
                (bar.close - entry.close)
                if side == "bull"
                else (entry.close - bar.close)
            )
            return bar.timestamp, bar.close, pnl
        if side == "bull":
            if bar.low <= sl:
                return bar.timestamp, sl, sl - entry.close
            if bar.high >= tp:
                return bar.timestamp, tp, tp - entry.close
        else:
            if bar.high >= sl:
                return bar.timestamp, sl, entry.close - sl
            if bar.low <= tp:
                return bar.timestamp, tp, entry.close - tp
    last = ltf[-1]
    pnl = (
        (last.close - entry.close) if side == "bull" else (entry.close - last.close)
    )
    return last.timestamp, last.close, pnl


class Ml03FirstNy5mStrategy(BaseStrategy):
    """
    ML03 — Regla de la primera vela (NY open):

    1. At 09:30 ET on 5m, wait for the 09:30–09:35 candle to close.
    2. Mark that candle's high and low (day key levels).
    3. On 1m: when price breaks a level, require an FVG (gap between wicks).
    4. Wait for a retest of that FVG + engulfing candle → entry.
    5. Target ~1:3 to 1:5 R.
    """

    @property
    def name(self) -> str:
        return STRATEGY_ML03_FIRST_NY5

    @property
    def description(self) -> str:
        return (
            "ML03 First NY 5m candle: mark 09:30–09:35 high/low; "
            "1m break with FVG + retest engulfing; RR 1:3–1:5."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "5m"

    @property
    def scan_lookback_days(self) -> int:
        return 7

    @property
    def scan_extra_timeframes(self) -> tuple[str, ...]:
        return ("1m",)

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "timezone": "America/New_York",
            "rr_target": "3",
            "max_trades_per_day": 2,
            "one_side_per_level": True,
        }

    def evaluate(
        self,
        candles: list[Candle],
        context: StrategyContext,
    ) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        rr = Decimal(str(params.get("rr_target") or "3"))
        max_per_day = int(params.get("max_trades_per_day") or 2)
        one_side = bool(params.get("one_side_per_level", True))

        htf_5m = sorted(candles, key=lambda c: c.timestamp)
        extras = context.extra_candles or {}
        ltf_1m = sorted(list(extras.get("1m") or []), key=lambda c: c.timestamp)

        signals: list[Signal] = []
        trades: list[Trade] = []

        if len(htf_5m) < 2 or len(ltf_1m) < 5:
            return StrategyResult(
                signals=signals,
                trades=trades,
                metrics=metrics_from_trades(trades),
            )

        start_d = (
            context.start.date()
            if isinstance(context.start, datetime)
            else context.start
        )
        end_d = (
            context.end.date() if isinstance(context.end, datetime) else context.end
        )
        days = sorted(
            {
                _local(c.timestamp, tz).date()
                for c in htf_5m
                if start_d <= _local(c.timestamp, tz).date() <= end_d
            }
        )

        for day in days:
            fr = find_first_ny_5m(htf_5m, day=day, tz=tz)
            if fr is None or fr.high <= fr.low:
                continue

            day_1m = [
                c
                for c in ltf_1m
                if _local(c.timestamp, tz).date() == day
                and RTH_OPEN <= _local(c.timestamp, tz).time() < RTH_CLOSE
                and _local(c.timestamp, tz).time() >= FIRST_5M_END
            ]
            if len(day_1m) < 5:
                continue

            day_trades = 0
            used_sides: set[Bias] = set()

            for side, level in (("bull", fr.high), ("bear", fr.low)):
                if day_trades >= max_per_day:
                    break
                if one_side and side in used_sides:
                    continue

                fvg = detect_break_fvg(day_1m, level=level, side=side, start_index=2)
                if fvg is None:
                    continue

                for i in range(fvg.form_index + 1, len(day_1m)):
                    if day_trades >= max_per_day:
                        break
                    prior, curr = day_1m[i - 1], day_1m[i]
                    if not fvg_retested(curr, fvg) and not fvg_retested(prior, fvg):
                        continue
                    ok_eng = (
                        is_bullish_engulfing(prior, curr)
                        if side == "bull"
                        else is_bearish_engulfing(prior, curr)
                    )
                    if not ok_eng:
                        continue

                    trade_side = Side.LONG if side == "bull" else Side.SHORT
                    sl = curr.low if side == "bull" else curr.high
                    risk = abs(curr.close - sl)
                    if risk <= 0:
                        risk = abs(fvg.top - fvg.bottom) or Decimal("1")
                    tp = (
                        curr.close + risk * rr
                        if side == "bull"
                        else curr.close - risk * rr
                    )
                    reason = (
                        f"ML03 {side} first5m | range[{fr.low}-{fr.high}] | "
                        f"FVG[{fvg.bottom}-{fvg.top}] + engulfing retest"
                    )
                    signals.append(
                        Signal(
                            timestamp=curr.timestamp,
                            side=trade_side,
                            price=curr.close,
                            reason=reason,
                            ticker=context.ticker,
                        )
                    )
                    exit_t, exit_px, pnl = _close_trade(
                        side=side,
                        entry=curr,
                        ltf=day_1m,
                        entry_index=i,
                        sl=sl,
                        tp=tp,
                        tz=tz,
                    )
                    trades.append(
                        Trade(
                            side=trade_side,
                            entry_time=curr.timestamp,
                            entry_price=curr.close,
                            signal=reason,
                            exit_time=exit_t,
                            exit_price=exit_px,
                            profit_loss=pnl,
                            notes=(
                                f"First NY 5m H/L; 1m FVG break + engulfing; "
                                f"SL={sl} TP={tp} ({rr}R)"
                            ),
                            setup={
                                "kind": "ml03_first_ny5",
                                "bias": side,
                                "first5m": {
                                    "high": str(fr.high),
                                    "low": str(fr.low),
                                    "time": fr.timestamp.isoformat(),
                                },
                                "fvg": {
                                    "top": str(fvg.top),
                                    "bottom": str(fvg.bottom),
                                },
                                "sl": str(sl),
                                "tp": str(tp),
                            },
                        )
                    )
                    day_trades += 1
                    used_sides.add(side)
                    break

        return StrategyResult(
            signals=signals,
            trades=trades,
            metrics=metrics_from_trades(trades),
        )

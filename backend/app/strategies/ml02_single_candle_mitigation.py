"""ML02 — Single Candle Mitigation at HTF Order Block (Options + Futures)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from zoneinfo import ZoneInfo

from app.core.constants import STRATEGY_ML02_SCM
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.signals import Signal
from app.domain.strategy_types import StrategyContext, StrategyMetrics, StrategyResult
from app.domain.trades import Trade
from app.strategies.base import BaseStrategy

Bias = Literal["bull", "bear", "range"]


@dataclass(frozen=True, slots=True)
class OrderBlock:
    """HTF supply/demand zone from the impulse that caused BOS."""

    side: Bias  # bull = demand, bear = supply
    top: Decimal
    bottom: Decimal
    index: int
    bos_index: int


@dataclass(frozen=True, slots=True)
class ScmHit:
    index: int
    side: Bias
    candle: Candle
    prior: Candle


def _local(ts: datetime, tz: ZoneInfo) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=tz)
    return ts.astimezone(tz)


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


def _bullish(c: Candle) -> bool:
    return c.close >= c.open


def _bearish(c: Candle) -> bool:
    return c.close < c.open


def is_bearish_scm(prior: Candle, curr: Candle) -> bool:
    """SELL SCM: sweeps prior high and closes back below that high."""
    return curr.high > prior.high and curr.close < prior.high


def is_bullish_scm(prior: Candle, curr: Candle) -> bool:
    """BUY SCM: sweeps prior low and closes back above that low."""
    return curr.low < prior.low and curr.close > prior.low


def overlaps_ob(c: Candle, ob: OrderBlock) -> bool:
    """True if candle range intersects the HTF OB zone."""
    return c.low <= ob.top and c.high >= ob.bottom


def _htf_bias_and_ob(
    htf: list[Candle],
    *,
    left: int,
    right: int,
) -> tuple[Bias, OrderBlock | None, str]:
    """
    Bias from last close beyond a swing (BOS).
    OB = last opposing candle before the impulsive move into that BOS.
    """
    if len(htf) < left + right + 8:
        return "range", None, "insufficient_htf"

    highs = _swing_highs(htf, left, right)
    lows = _swing_lows(htf, left, right)
    if not highs and not lows:
        return "range", None, "no_swings"

    # Find most recent BOS: close beyond a prior swing after that swing formed
    last_bos_i: int | None = None
    last_bias: Bias = "range"
    last_swing_i: int | None = None

    for i in range(left + right, len(htf)):
        # bullish BOS: close above a swing high that formed earlier
        for sh in highs:
            if sh >= i:
                break
            if htf[i].close > htf[sh].high:
                # prefer later BOS
                if last_bos_i is None or i >= last_bos_i:
                    last_bos_i = i
                    last_bias = "bull"
                    last_swing_i = sh
        for sl in lows:
            if sl >= i:
                break
            if htf[i].close < htf[sl].low:
                if last_bos_i is None or i >= last_bos_i:
                    last_bos_i = i
                    last_bias = "bear"
                    last_swing_i = sl

    if last_bos_i is None or last_swing_i is None or last_bias == "range":
        return "range", None, "no_bos"

    # Opposing candle before BOS = OB (last bullish before bear BOS / last bearish before bull BOS)
    ob_i: int | None = None
    search_from = last_swing_i
    search_to = last_bos_i
    if last_bias == "bear":
        for j in range(search_to - 1, search_from - 1, -1):
            if j < 0:
                break
            if _bullish(htf[j]):
                ob_i = j
                break
        if ob_i is None:
            # fallback: swing high candle itself
            ob_i = last_swing_i if last_swing_i < last_bos_i else max(0, last_bos_i - 1)
    else:
        for j in range(search_to - 1, search_from - 1, -1):
            if j < 0:
                break
            if _bearish(htf[j]):
                ob_i = j
                break
        if ob_i is None:
            ob_i = last_swing_i if last_swing_i < last_bos_i else max(0, last_bos_i - 1)

    c = htf[ob_i]
    body_top = max(c.open, c.close)
    body_bot = min(c.open, c.close)
    ob = OrderBlock(
        side=last_bias,
        top=body_top if body_top > body_bot else c.high,
        bottom=body_bot if body_top > body_bot else c.low,
        index=ob_i,
        bos_index=last_bos_i,
    )
    return last_bias, ob, f"bos@{last_bos_i}_ob@{ob_i}"


def _inducement_swept(
    htf: list[Candle],
    ob: OrderBlock,
    *,
    before_index: int,
) -> tuple[bool, str]:
    """
    After BOS and before SCM, look for an internal liquidity sweep
    (engineering / inducement) away from mid-OB traps.
    """
    start = ob.bos_index + 1
    end = min(before_index, len(htf) - 1)
    if end - start < 2:
        # Too little room — treat as optional soft pass if price already revisited OB
        return True, "inducement_skipped_short_path"

    window = htf[start : end + 1]
    if len(window) < 3:
        return True, "inducement_skipped_short_path"

    if ob.side == "bear":
        # sell path: sweep of a local high (buy-side liquidity) before returning to supply OB
        for i in range(1, len(window)):
            prior, curr = window[i - 1], window[i]
            if curr.high > prior.high and curr.close < curr.high:
                # prefer sweeps that happen below the OB (not inside OB yet)
                if curr.high < ob.bottom or overlaps_ob(curr, ob):
                    return True, f"sell_inducement@{start + i}"
        return False, "no_sell_inducement"

    for i in range(1, len(window)):
        prior, curr = window[i - 1], window[i]
        if curr.low < prior.low and curr.close > curr.low:
            if curr.low > ob.top or overlaps_ob(curr, ob):
                return True, f"buy_inducement@{start + i}"
    return False, "no_buy_inducement"


def find_scm_in_ob(
    ltf: list[Candle],
    ob: OrderBlock,
    *,
    lookback: int = 12,
) -> ScmHit | None:
    """Most recent SCM candle that overlaps the HTF OB."""
    if len(ltf) < 2:
        return None
    start = max(1, len(ltf) - lookback)
    for i in range(len(ltf) - 1, start - 1, -1):
        prior, curr = ltf[i - 1], ltf[i]
        if not overlaps_ob(curr, ob):
            continue
        if ob.side == "bear" and is_bearish_scm(prior, curr):
            return ScmHit(index=i, side="bear", candle=curr, prior=prior)
        if ob.side == "bull" and is_bullish_scm(prior, curr):
            return ScmHit(index=i, side="bull", candle=curr, prior=prior)
    return None


def _map_ltf_index_to_htf(
    ltf_ts: datetime,
    htf: list[Candle],
) -> int:
    """Nearest HTF bar at or before LTF timestamp."""
    idx = 0
    for i, c in enumerate(htf):
        if c.timestamp <= ltf_ts:
            idx = i
        else:
            break
    return idx


class Ml02SingleCandleMitigationStrategy(BaseStrategy):
    """
    ML02 heuristics (v1):

    1. HTF (15m) BOS → bias + Order Block (last opposing candle before impulse).
    2. Inducement / eng. liquidity swept on the path back.
    3. LTF Single Candle Mitigation inside/at the HTF OB = entry trigger.
    """

    @property
    def name(self) -> str:
        return STRATEGY_ML02_SCM

    @property
    def description(self) -> str:
        return (
            "ML02 SCM: mitigate HTF order block after inducement; "
            "entry = single candle sweep+close-back inside the OB."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "15m"

    @property
    def scan_lookback_days(self) -> int:
        return 14

    @property
    def scan_extra_timeframes(self) -> tuple[str, ...]:
        # Futures entry often 1m/3m; Options uses 5m. Load both when available.
        return ("5m", "1m")

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "swing_left": 2,
            "swing_right": 2,
            "scm_lookback": 12,
            "require_inducement": True,
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
        lookback = int(params.get("scm_lookback") or 12)
        require_ind = bool(params.get("require_inducement", True))

        htf = sorted(candles, key=lambda c: c.timestamp)
        ltf = sorted(
            list(
                context.extra_candles.get("1m")
                or context.extra_candles.get("5m")
                or context.extra_candles.get("3m")
                or context.extra_candles.get("15m")
                or []
            ),
            key=lambda c: c.timestamp,
        )
        # Prefer finer TF when both present
        if context.extra_candles.get("1m") and context.extra_candles.get("5m"):
            # Use 1m for futures-style entry; if empty fall back already handled
            one = sorted(context.extra_candles["1m"], key=lambda c: c.timestamp)
            if len(one) >= 4:
                ltf = one
            else:
                ltf = sorted(context.extra_candles["5m"], key=lambda c: c.timestamp)

        start_d: date = context.start
        end_d: date = context.end
        htf_day = [
            c
            for c in htf
            if start_d <= _local(c.timestamp, tz).date() <= end_d
        ]
        ltf_day = [
            c
            for c in ltf
            if start_d <= _local(c.timestamp, tz).date() <= end_d
        ]

        bias, ob, bias_note = _htf_bias_and_ob(htf, left=left, right=right)
        signals: list[Signal] = []
        trades: list[Trade] = []

        if bias == "range" or ob is None or not ltf:
            return StrategyResult(
                signals=signals,
                trades=trades,
                metrics=StrategyMetrics(
                    total_trades=0,
                    winning_trades=0,
                    losing_trades=0,
                    win_rate=0.0,
                    profit_loss=Decimal("0"),
                    max_drawdown=Decimal("0"),
                ),
            )

        series = ltf_day or ltf
        hit = find_scm_in_ob(series, ob, lookback=lookback)
        if hit is None:
            return StrategyResult(
                signals=signals,
                trades=trades,
                metrics=StrategyMetrics(
                    total_trades=0,
                    winning_trades=0,
                    losing_trades=0,
                    win_rate=0.0,
                    profit_loss=Decimal("0"),
                    max_drawdown=Decimal("0"),
                ),
            )

        # Inducement checked on HTF path up to SCM time
        htf_i = _map_ltf_index_to_htf(hit.candle.timestamp, htf)
        indu_ok, indu_note = _inducement_swept(htf, ob, before_index=htf_i)
        if require_ind and not indu_ok:
            return StrategyResult(
                signals=signals,
                trades=trades,
                metrics=StrategyMetrics(
                    total_trades=0,
                    winning_trades=0,
                    losing_trades=0,
                    win_rate=0.0,
                    profit_loss=Decimal("0"),
                    max_drawdown=Decimal("0"),
                ),
            )

        # Prefer hits on the requested session date
        hit_day = _local(hit.candle.timestamp, tz).date()
        if not (start_d <= hit_day <= end_d) and htf_day:
            # still allow if evaluating with lookback-only data
            pass

        side = Side.LONG if hit.side == "bull" else Side.SHORT
        reason = (
            f"ML02 {hit.side} SCM@OB | {bias_note} | {indu_note} | "
            f"ob[{ob.bottom}-{ob.top}]"
        )
        signals.append(
            Signal(
                timestamp=hit.candle.timestamp,
                side=side,
                price=hit.candle.close,
                reason=reason,
                ticker=context.ticker,
            )
        )
        sl = (
            hit.candle.high
            if hit.side == "bear"
            else hit.candle.low
        )
        trades.append(
            Trade(
                side=side,
                entry_time=hit.candle.timestamp,
                entry_price=hit.candle.close,
                signal=reason,
                notes=(
                    f"Heuristic — confirm HTF OB mitigation + SCM on chart; "
                    f"SL beyond {'high' if hit.side == 'bear' else 'low'} {sl}"
                ),
            )
        )

        return StrategyResult(
            signals=signals,
            trades=trades,
            metrics=StrategyMetrics(
                total_trades=len(trades),
                winning_trades=0,
                losing_trades=0,
                win_rate=0.0,
                profit_loss=Decimal("0"),
                max_drawdown=Decimal("0"),
            ),
        )

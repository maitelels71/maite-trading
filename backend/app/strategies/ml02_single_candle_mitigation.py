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
from app.strategies.backtest_utils import metrics_from_trades
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
    end_index: int | None = None,
) -> tuple[Bias, OrderBlock | None, str]:
    """
    Bias from last close beyond a swing (BOS).
    OB = last opposing candle before the impulsive move into that BOS.

    When ``end_index`` is set, only bars ``0..end_index`` are used (causal as-of).
    """
    if end_index is not None:
        htf = htf[: max(0, end_index) + 1]
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
    lookback: int | None = 12,
    start_index: int = 1,
    end_index: int | None = None,
) -> ScmHit | None:
    """Most recent SCM candle that overlaps the HTF OB (optional lookback window)."""
    if len(ltf) < 2:
        return None
    last = len(ltf) - 1 if end_index is None else min(end_index, len(ltf) - 1)
    if lookback is None:
        first = max(1, start_index)
    else:
        first = max(1, start_index, last - lookback + 1)
    for i in range(last, first - 1, -1):
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


def _resolve_ltf(
    context: StrategyContext,
    *,
    start_d: date,
    end_d: date,
    tz: ZoneInfo,
) -> tuple[list[Candle], list[Candle]]:
    """Pick LTF with enough bars inside the requested window; return (window, full)."""
    extras = context.extra_candles or {}
    candidates = [
        sorted(list(extras.get("1m") or []), key=lambda c: c.timestamp),
        sorted(list(extras.get("5m") or []), key=lambda c: c.timestamp),
        sorted(list(extras.get("3m") or []), key=lambda c: c.timestamp),
        sorted(list(extras.get("15m") or []), key=lambda c: c.timestamp),
    ]
    for full in candidates:
        win = [
            c
            for c in full
            if start_d <= _local(c.timestamp, tz).date() <= end_d
        ]
        if len(win) >= 4:
            return win, full
    # Fallback: best available full series (may be empty)
    for full in candidates:
        if full:
            win = [
                c
                for c in full
                if start_d <= _local(c.timestamp, tz).date() <= end_d
            ]
            return (win or full), full
    return [], []


def _close_trade_on_ltf(
    *,
    side: Bias,
    entry: Candle,
    ltf: list[Candle],
    entry_index: int,
    sl: Decimal,
    tp: Decimal,
) -> tuple[datetime, Decimal, Decimal]:
    """Walk forward to SL/TP; else exit on last available LTF bar."""
    for j in range(entry_index + 1, len(ltf)):
        bar = ltf[j]
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


class Ml02SingleCandleMitigationStrategy(BaseStrategy):
    """
    ML02 heuristics (v1):

    1. HTF (15m) BOS → bias + Order Block (last opposing candle before impulse).
    2. Inducement / eng. liquidity swept on the path back.
    3. LTF Single Candle Mitigation inside/at the HTF OB = entry trigger.

    Backtest walks the full date range on LTF (not only the last N bars).
    Live/scan still uses the same walk restricted to ``context.start..end``.
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
            # None = walk full LTF window (backtest). Set an int for live-only tail scan.
            "scm_lookback": None,
            "require_inducement": True,
            "rr_target": "1.5",
            "max_trades": 50,
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
        raw_lb = params.get("scm_lookback", None)
        lookback = None if raw_lb in (None, "", "none") else int(raw_lb)
        require_ind = bool(params.get("require_inducement", True))
        rr = Decimal(str(params.get("rr_target") or "1.5"))
        max_trades = int(params.get("max_trades") or 50)

        htf = sorted(candles, key=lambda c: c.timestamp)
        start_d: date = context.start
        end_d: date = context.end
        series, ltf = _resolve_ltf(context, start_d=start_d, end_d=end_d, tz=tz)

        signals: list[Signal] = []
        trades: list[Trade] = []

        if len(htf) < left + right + 8 or len(series) < 2:
            return StrategyResult(
                signals=signals,
                trades=trades,
                metrics=metrics_from_trades(trades),
            )

        # Indices into full `ltf` for forward exits; search window on `series`.
        ltf_by_ts = {c.timestamp: i for i, c in enumerate(ltf)}

        search_start = 1
        if lookback is not None:
            search_start = max(1, len(series) - lookback)

        last_entry_i = -10_000
        cooldown = 3  # LTF bars between entries

        for i in range(search_start, len(series)):
            if len(trades) >= max_trades:
                break
            if i - last_entry_i < cooldown:
                continue
            prior, curr = series[i - 1], series[i]
            htf_i = _map_ltf_index_to_htf(curr.timestamp, htf)
            bias, ob, bias_note = _htf_bias_and_ob(
                htf, left=left, right=right, end_index=htf_i
            )
            if bias == "range" or ob is None:
                continue
            if not overlaps_ob(curr, ob):
                continue
            is_scm = (
                (ob.side == "bear" and is_bearish_scm(prior, curr))
                or (ob.side == "bull" and is_bullish_scm(prior, curr))
            )
            if not is_scm:
                continue

            indu_ok, indu_note = _inducement_swept(htf, ob, before_index=htf_i)
            if require_ind and not indu_ok:
                continue

            side = Side.LONG if ob.side == "bull" else Side.SHORT
            hit_side: Bias = ob.side
            reason = (
                f"ML02 {hit_side} SCM@OB | {bias_note} | {indu_note} | "
                f"ob[{ob.bottom}-{ob.top}]"
            )
            signals.append(
                Signal(
                    timestamp=curr.timestamp,
                    side=side,
                    price=curr.close,
                    reason=reason,
                    ticker=context.ticker,
                )
            )

            sl = curr.high if hit_side == "bear" else curr.low
            risk = abs(curr.close - sl)
            if risk <= 0:
                risk = abs(ob.top - ob.bottom) or Decimal("1")
            if hit_side == "bull":
                tp = curr.close + (risk * rr)
            else:
                tp = curr.close - (risk * rr)

            full_i = ltf_by_ts.get(curr.timestamp, i)
            exit_t, exit_px, pnl = _close_trade_on_ltf(
                side=hit_side,
                entry=curr,
                ltf=ltf if ltf else series,
                entry_index=full_i if ltf else i,
                sl=sl,
                tp=tp,
            )
            trades.append(
                Trade(
                    side=side,
                    entry_time=curr.timestamp,
                    entry_price=curr.close,
                    signal=reason,
                    exit_time=exit_t,
                    exit_price=exit_px,
                    profit_loss=pnl,
                    notes=(
                        f"SCM entry; SL={sl} TP={tp} ({rr}R); "
                        f"confirm HTF OB mitigation on chart"
                    ),
                )
            )
            last_entry_i = i

        return StrategyResult(
            signals=signals,
            trades=trades,
            metrics=metrics_from_trades(trades),
        )

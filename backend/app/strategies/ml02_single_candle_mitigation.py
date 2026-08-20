"""ML02 — Single Candle Mitigation at HTF OB or imbalance (Options + Futures)."""

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
ZoneKind = Literal["ob", "fvg"]


@dataclass(frozen=True, slots=True)
class OrderBlock:
    """HTF mitigation zone: classic OB body or FVG / imbalance from the BOS impulse."""

    side: Bias  # bull = demand, bear = supply
    top: Decimal
    bottom: Decimal
    index: int
    bos_index: int
    kind: ZoneKind = "ob"


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


def _clock_et(ts: datetime, tz: ZoneInfo) -> str:
    return _local(ts, tz).strftime("%H:%M")


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


def _candle_range(c: Candle) -> Decimal:
    return c.high - c.low


def _upper_wick(c: Candle) -> Decimal:
    return c.high - max(c.open, c.close)


def _lower_wick(c: Candle) -> Decimal:
    return min(c.open, c.close) - c.low


def is_bearish_scm(
    prior: Candle,
    curr: Candle,
    *,
    min_wick_frac: Decimal = Decimal("0.55"),
    min_sweep_frac: Decimal = Decimal("0.20"),
    ref_high: Decimal | None = None,
) -> bool:
    """SELL SCM: long upper wick sweeps prior highs (liquidity) and rejects."""
    rng = _candle_range(curr)
    if rng <= 0:
        return False
    upper = _upper_wick(curr)
    if upper / rng < min_wick_frac:
        return False
    liq = ref_high if ref_high is not None else prior.high
    if curr.high <= liq:
        return False
    sweep = curr.high - liq
    if sweep / rng < min_sweep_frac:
        return False
    # Rejection: close back below taken liquidity and in lower half of the candle
    if curr.close >= liq:
        return False
    if curr.close > curr.low + (rng * Decimal("0.50")):
        return False
    return True


def is_bullish_scm(
    prior: Candle,
    curr: Candle,
    *,
    min_wick_frac: Decimal = Decimal("0.55"),
    min_sweep_frac: Decimal = Decimal("0.20"),
    ref_low: Decimal | None = None,
) -> bool:
    """BUY SCM: long lower wick sweeps prior lows (liquidity) and rejects."""
    rng = _candle_range(curr)
    if rng <= 0:
        return False
    lower = _lower_wick(curr)
    if lower / rng < min_wick_frac:
        return False
    liq = ref_low if ref_low is not None else prior.low
    if curr.low >= liq:
        return False
    sweep = liq - curr.low
    if sweep / rng < min_sweep_frac:
        return False
    if curr.close <= liq:
        return False
    if curr.close < curr.high - (rng * Decimal("0.50")):
        return False
    return True


def prior_liquidity_high(candles: list[Candle], end_index: int, lookback: int) -> Decimal:
    """Highest high of the N bars before ``end_index`` (liquidity to take on shorts)."""
    first = max(0, end_index - lookback)
    return max(c.high for c in candles[first:end_index])


def prior_liquidity_low(candles: list[Candle], end_index: int, lookback: int) -> Decimal:
    """Lowest low of the N bars before ``end_index`` (liquidity to take on longs)."""
    first = max(0, end_index - lookback)
    return min(c.low for c in candles[first:end_index])


def overlaps_ob(c: Candle, ob: OrderBlock) -> bool:
    """True if candle range intersects the HTF zone (OB or FVG)."""
    return c.low <= ob.top and c.high >= ob.bottom


def mitigates_ob(c: Candle, ob: OrderBlock) -> bool:
    """
    True mitigation: wick trades into the HTF zone (OB or imbalance) and close rejects
    (does not close through the far side of the block).
    """
    if not overlaps_ob(c, ob):
        return False
    if ob.side == "bear":
        # Supply: must wick into/above zone bottom; close must not stay above zone top
        if c.high < ob.bottom:
            return False
        return c.close <= ob.top
    # Demand: must wick into/below zone top; close must not stay below zone bottom
    if c.low > ob.top:
        return False
    return c.close >= ob.bottom


def _find_impulse_fvg(
    htf: list[Candle],
    *,
    side: Bias,
    search_from: int,
    search_to: int,
    bos_index: int,
) -> OrderBlock | None:
    """
    3-candle Fair Value Gap / imbalance created during the BOS impulse.

    Bullish FVG (demand): candle[i-2].high < candle[i].low
    Bearish FVG (supply): candle[i-2].low > candle[i].high
    """
    if side == "range":
        return None
    lo = max(2, search_from)
    hi = min(search_to, len(htf) - 1)
    best: OrderBlock | None = None
    for i in range(lo, hi + 1):
        a, _, c = htf[i - 2], htf[i - 1], htf[i]
        if side == "bull" and a.high < c.low:
            top, bottom = c.low, a.high
            if top <= bottom:
                continue
            cand = OrderBlock(
                side="bull",
                top=top,
                bottom=bottom,
                index=i - 1,
                bos_index=bos_index,
                kind="fvg",
            )
            # Prefer the FVG closest to the BOS (last in impulse)
            best = cand
        elif side == "bear" and a.low > c.high:
            top, bottom = a.low, c.high
            if top <= bottom:
                continue
            cand = OrderBlock(
                side="bear",
                top=top,
                bottom=bottom,
                index=i - 1,
                bos_index=bos_index,
                kind="fvg",
            )
            best = cand
    return best


def _htf_bias_and_zones(
    htf: list[Candle],
    *,
    left: int,
    right: int,
    end_index: int | None = None,
    tz: ZoneInfo | None = None,
    min_impulse_bars: int = 3,
) -> tuple[Bias, list[OrderBlock], str]:
    """
    Bias from the last *true* BOS (first close that breaks a newer swing),
    plus mitigation zones: classic OB and/or impulse FVG.

    Continuation bars that stay through an already-broken swing are not a new BOS.
    When ``end_index`` is set, only bars ``0..end_index`` are used (causal as-of).
    """
    zone_tz = tz or ZoneInfo("America/New_York")
    if end_index is not None:
        htf = htf[: max(0, end_index) + 1]
    if len(htf) < left + right + 8:
        return "range", [], "insufficient_htf"

    highs = _swing_highs(htf, left, right)
    lows = _swing_lows(htf, left, right)
    if not highs and not lows:
        return "range", [], "no_swings"

    last_bos_i: int | None = None
    last_bias: Bias = "range"
    last_swing_i: int | None = None

    for i in range(left + right, len(htf)):
        newest_bull_sh: int | None = None
        for sh in highs:
            if sh >= i:
                break
            if htf[i].close > htf[sh].high:
                newest_bull_sh = sh
        newest_bear_sl: int | None = None
        for sl in lows:
            if sl >= i:
                break
            if htf[i].close < htf[sl].low:
                newest_bear_sl = sl

        bull_rank = newest_bull_sh if newest_bull_sh is not None else -1
        bear_rank = newest_bear_sl if newest_bear_sl is not None else -1
        if newest_bull_sh is not None and bull_rank >= bear_rank:
            sh = newest_bull_sh
            if last_bias != "bull" or last_swing_i is None or sh > last_swing_i:
                last_bos_i = i
                last_bias = "bull"
                last_swing_i = sh
        elif newest_bear_sl is not None:
            sl = newest_bear_sl
            if last_bias != "bear" or last_swing_i is None or sl > last_swing_i:
                last_bos_i = i
                last_bias = "bear"
                last_swing_i = sl

    if last_bos_i is None or last_swing_i is None or last_bias == "range":
        return "range", [], "no_bos"
    if last_bos_i - last_swing_i < min_impulse_bars:
        return "range", [], "impulse_too_short"

    search_from = last_swing_i
    search_to = last_bos_i
    ob_i: int | None = None
    if last_bias == "bear":
        for j in range(search_to - 1, search_from - 1, -1):
            if j < 0:
                break
            if _bullish(htf[j]):
                ob_i = j
                break
        if ob_i is None:
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
        kind="ob",
    )
    zones: list[OrderBlock] = [ob]
    fvg = _find_impulse_fvg(
        htf,
        side=last_bias,
        search_from=search_from,
        search_to=search_to,
        bos_index=last_bos_i,
    )
    if fvg is not None:
        zones.append(fvg)
    bos_c = htf[last_bos_i]
    ob_c = htf[ob_i]
    note = (
        f"BOS {_clock_et(bos_c.timestamp, zone_tz)} ET "
        f"@ {bos_c.close} · OB {_clock_et(ob_c.timestamp, zone_tz)} ET"
    )
    if fvg is not None:
        note += f" · FVG {fvg.bottom}-{fvg.top}"
    return last_bias, zones, note


def _htf_bias_and_ob(
    htf: list[Candle],
    *,
    left: int,
    right: int,
    end_index: int | None = None,
    tz: ZoneInfo | None = None,
    min_impulse_bars: int = 3,
) -> tuple[Bias, OrderBlock | None, str]:
    """Backward-compatible: primary OB (first zone). Prefer ``_htf_bias_and_zones``."""
    bias, zones, note = _htf_bias_and_zones(
        htf,
        left=left,
        right=right,
        end_index=end_index,
        tz=tz,
        min_impulse_bars=min_impulse_bars,
    )
    return bias, (zones[0] if zones else None), note


def _inducement_swept(
    htf: list[Candle],
    ob: OrderBlock,
    *,
    before_index: int,
    tz: ZoneInfo | None = None,
) -> tuple[bool, str]:
    """
    After BOS and before SCM, require an internal liquidity sweep
    (engineering / inducement) — not a mid-OB trap on the impulse itself.
    """
    zone_tz = tz or ZoneInfo("America/New_York")
    start = ob.bos_index + 1
    end = min(before_index, len(htf) - 1)
    if end - start < 2:
        return False, "no_inducement_path"

    window = htf[start : end + 1]
    if len(window) < 4:
        return False, "no_inducement_path"

    if ob.side == "bear":
        swings = _swing_highs(window, left=1, right=1)
        for hi in swings:
            swept = window[hi].high
            for j in range(hi + 2, len(window)):
                curr = window[j]
                if curr.high > swept and curr.close < swept:
                    return True, f"inducement {_clock_et(curr.timestamp, zone_tz)} ET"
        return False, "no_sell_inducement"

    swings = _swing_lows(window, left=1, right=1)
    for lo in swings:
        swept = window[lo].low
        for j in range(lo + 2, len(window)):
            curr = window[j]
            if curr.low < swept and curr.close > swept:
                return True, f"inducement {_clock_et(curr.timestamp, zone_tz)} ET"
    return False, "no_buy_inducement"


def find_scm_in_ob(
    ltf: list[Candle],
    ob: OrderBlock,
    *,
    lookback: int | None = 12,
    start_index: int = 1,
    end_index: int | None = None,
    min_wick_frac: Decimal = Decimal("0.55"),
    min_sweep_frac: Decimal = Decimal("0.20"),
    liq_lookback: int = 3,
) -> ScmHit | None:
    """Most recent clear long-wick SCM that mitigates the HTF zone (OB or FVG)."""
    if len(ltf) < 2:
        return None
    last = len(ltf) - 1 if end_index is None else min(end_index, len(ltf) - 1)
    if lookback is None:
        first = max(1, start_index)
    else:
        first = max(1, start_index, last - lookback + 1)
    for i in range(last, first - 1, -1):
        prior, curr = ltf[i - 1], ltf[i]
        if not mitigates_ob(curr, ob):
            continue
        if ob.side == "bear":
            ref = prior_liquidity_high(ltf, i, liq_lookback)
            if is_bearish_scm(
                prior,
                curr,
                min_wick_frac=min_wick_frac,
                min_sweep_frac=min_sweep_frac,
                ref_high=ref,
            ):
                return ScmHit(index=i, side="bear", candle=curr, prior=prior)
        if ob.side == "bull":
            ref = prior_liquidity_low(ltf, i, liq_lookback)
            if is_bullish_scm(
                prior,
                curr,
                min_wick_frac=min_wick_frac,
                min_sweep_frac=min_sweep_frac,
                ref_low=ref,
            ):
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
    ML02 heuristics:

    1. HTF BOS = first close that breaks a newer swing (not every later bar).
    2. Mark OB / FVG of that impulse; wait for a pullback.
    3. Inducement / eng. liquidity swept on the path back (required).
    4. LTF SCM into the HTF zone while taking prior highs/lows = entry.

    Backtest walks the full date range on LTF (not only the last N bars).
    """

    @property
    def name(self) -> str:
        return STRATEGY_ML02_SCM

    @property
    def description(self) -> str:
        return (
            "ML02 SCM: mitigate HTF OB or imbalance (FVG) after inducement; "
            "entry = long-wick sweep of prior highs/lows inside the HTF zone."
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
            "require_inducement": False,
            "min_impulse_bars": 3,
            "min_bars_after_bos": 4,
            # Live desk: slightly softer than textbook so Globex TOP 5 is usable.
            "min_wick_frac": "0.45",
            "min_sweep_frac": "0.15",
            # SCM must take highs/lows of the previous N LTF bars (not only last bar).
            "liq_lookback": 3,
            "allow_fvg_mitigation": True,
            "rr_target": "1.5",
            "max_trades": 12,
            "cooldown_bars": 20,
            "one_trade_per_ob": True,
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
        max_trades = int(params.get("max_trades") or 12)
        cooldown = int(params.get("cooldown_bars") or 20)
        one_per_ob = bool(params.get("one_trade_per_ob", True))
        min_wick = Decimal(str(params.get("min_wick_frac") or "0.55"))
        min_sweep = Decimal(str(params.get("min_sweep_frac") or "0.20"))
        liq_lb = max(1, int(params.get("liq_lookback") or 3))
        allow_fvg = bool(params.get("allow_fvg_mitigation", True))
        min_impulse = max(2, int(params.get("min_impulse_bars") or 3))
        min_after_bos = max(2, int(params.get("min_bars_after_bos") or 4))

        htf = sorted(candles, key=lambda c: c.timestamp)
        start_d = (
            context.start.date()
            if isinstance(context.start, datetime)
            else context.start
        )
        end_d = (
            context.end.date() if isinstance(context.end, datetime) else context.end
        )
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
        if lookback is None and start_d == end_d:
            # Live desk: ~90 LTF bars (~1.5h on 1m / ~7.5h on 5m), not 30-only.
            lookback = 90
        if lookback is not None:
            search_start = max(1, len(series) - lookback)

        last_entry_i = -10_000
        used_zone_keys: set[tuple[str, int, int]] = set()
        zone_cache: dict[
            int, tuple[Bias, list[OrderBlock], str]
        ] = {}

        for i in range(search_start, len(series)):
            if len(trades) >= max_trades:
                break
            if i - last_entry_i < cooldown:
                continue
            prior, curr = series[i - 1], series[i]
            htf_i = _map_ltf_index_to_htf(curr.timestamp, htf)
            cached = zone_cache.get(htf_i)
            if cached is None:
                cached = _htf_bias_and_zones(
                    htf,
                    left=left,
                    right=right,
                    end_index=htf_i,
                    tz=tz,
                    min_impulse_bars=min_impulse,
                )
                zone_cache[htf_i] = cached
            bias, zones, bias_note = cached
            if bias == "range" or not zones:
                continue
            if htf_i - zones[0].bos_index < min_after_bos:
                continue
            if not allow_fvg:
                zones = [z for z in zones if z.kind == "ob"]
            if not zones:
                continue

            # Prefer FVG if mitigated, else OB (imbalance first when price tags it)
            zone: OrderBlock | None = None
            for candidate in sorted(zones, key=lambda z: 0 if z.kind == "fvg" else 1):
                if mitigates_ob(curr, candidate):
                    zone = candidate
                    break
            if zone is None:
                continue

            if zone.side == "bear":
                ref_liq = prior_liquidity_high(series, i, liq_lb)
                is_scm = is_bearish_scm(
                    prior,
                    curr,
                    min_wick_frac=min_wick,
                    min_sweep_frac=min_sweep,
                    ref_high=ref_liq,
                )
            else:
                ref_liq = prior_liquidity_low(series, i, liq_lb)
                is_scm = is_bullish_scm(
                    prior,
                    curr,
                    min_wick_frac=min_wick,
                    min_sweep_frac=min_sweep,
                    ref_low=ref_liq,
                )
            if not is_scm:
                continue

            indu_ok, indu_note = _inducement_swept(
                htf, zone, before_index=htf_i, tz=tz
            )
            if require_ind and not indu_ok:
                continue

            zone_key = (zone.kind, zone.index, zone.bos_index)
            if one_per_ob and zone_key in used_zone_keys:
                continue

            side = Side.LONG if zone.side == "bull" else Side.SHORT
            hit_side: Bias = zone.side
            zone_label = "FVG" if zone.kind == "fvg" else "OB"
            reason = (
                f"ML02 {hit_side} SCM@{zone_label} | {bias_note} | {indu_note} | "
                f"{zone.kind}[{zone.bottom}-{zone.top}] liq={ref_liq}"
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
                risk = abs(zone.top - zone.bottom) or Decimal("1")
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
            zone_candle = htf[zone.index] if 0 <= zone.index < len(htf) else curr
            bos_candle = (
                htf[zone.bos_index] if 0 <= zone.bos_index < len(htf) else curr
            )
            if hit_side == "bear":
                liq_price, liq_kind = ref_liq, "buy_side"
            else:
                liq_price, liq_kind = ref_liq, "sell_side"
            setup = {
                "kind": "ml02_scm",
                "bias": hit_side,
                "zone_kind": zone.kind,
                "ob": {
                    "top": str(zone.top),
                    "bottom": str(zone.bottom),
                    "time": zone_candle.timestamp.isoformat(),
                    "bos_time": bos_candle.timestamp.isoformat(),
                    "kind": zone.kind,
                },
                "liquidity": {
                    "kind": liq_kind,
                    "price": str(liq_price),
                    "time": prior.timestamp.isoformat(),
                    "lookback": liq_lb,
                },
                "scm": {
                    "time": curr.timestamp.isoformat(),
                    "high": str(curr.high),
                    "low": str(curr.low),
                    "close": str(curr.close),
                },
                "sl": str(sl),
                "tp": str(tp),
            }
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
                        f"Long-wick SCM mitigating HTF {zone_label}; "
                        f"took prior {'highs' if hit_side == 'bear' else 'lows'}; "
                        f"SL={sl} TP={tp} ({rr}R)"
                    ),
                    setup=setup,
                )
            )
            last_entry_i = i
            used_zone_keys.add(zone_key)

        return StrategyResult(
            signals=signals,
            trades=trades,
            metrics=metrics_from_trades(trades),
        )

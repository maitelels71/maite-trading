"""CH01–CH06 — Channel daily scan filters (equity + futures).

Data: Yahoo OHLCV (1m/5m/15m, ~15 min delay) — analysis desk, not live exec.
Futures (PDF §5): same price/volume rules; session concepts (Gap, ORB, VWAP,
relative volume) anchor to NY cash RTH open 9:30 ET — not Globex calendar day.
Relative strength: equity vs SPY; index futures MNQ/NQ vs MES/ES when bench
candles are present.
"""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal
from statistics import pstdev
from typing import Any
from zoneinfo import ZoneInfo

from app.core.constants import (
    STRATEGY_CH01_GAP_GO,
    STRATEGY_CH02_VWAP_REV,
    STRATEGY_CH03_EMA_CROSS,
    STRATEGY_CH04_RSI_EXT,
    STRATEGY_CH05_REL_STRENGTH,
    STRATEGY_CH06_ORB,
)
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.strategy_types import StrategyContext, StrategyResult
from app.indicators import ema, rsi, session_vwap
from app.strategies.backtest_utils import (
    evaluate_each_session_day,
    local_ts,
    signal_and_session_trade,
)
from app.strategies.base import BaseStrategy

RTH_OPEN = time(9, 30)
RTH_CLOSE = time(16, 0)

# Futures RS pairs (desk symbols → preferred bench keys in extra_candles).
_FUTURES_RS_BENCH: dict[str, tuple[str, ...]] = {
    "MNQ": ("MES", "ES", "bench:MES", "bench:ES"),
    "NQ": ("ES", "MES", "bench:ES", "bench:MES"),
    "MES": ("MNQ", "NQ", "bench:MNQ", "bench:NQ"),
    "ES": ("NQ", "MNQ", "bench:NQ", "bench:MNQ"),
}
_EQUITY_RS_BENCH: tuple[str, ...] = (
    "bench:SPY",
    "SPY",
    "bench:QQQ",
    "QQQ",
)


def _rth(candles: list[Candle], tz: ZoneInfo) -> list[Candle]:
    return [
        c
        for c in sorted(candles, key=lambda x: x.timestamp)
        if RTH_OPEN <= local_ts(c.timestamp, tz).time() < RTH_CLOSE
    ]


def _day_bars(
    candles: list[Candle], day: date, tz: ZoneInfo
) -> list[Candle]:
    return [c for c in candles if local_ts(c.timestamp, tz).date() == day]


def _prior_close(
    candles: list[Candle], day: date, tz: ZoneInfo
) -> Decimal | None:
    prior = [
        c
        for c in candles
        if local_ts(c.timestamp, tz).date() < day
    ]
    return prior[-1].close if prior else None


def _avg_volume(bars: list[Candle]) -> Decimal:
    if not bars:
        return Decimal("0")
    return sum((c.volume or Decimal("0") for c in bars), Decimal("0")) / len(
        bars
    )


def _hit(
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


class Ch01GapGoStrategy(BaseStrategy):
    """Gap > 2% vs prior close + opening volume > 2× recent average."""

    @property
    def name(self) -> str:
        return STRATEGY_CH01_GAP_GO

    @property
    def description(self) -> str:
        return (
            "CH01 Gap & Go: open gap ≥2% vs prior close with opening volume "
            ">2× average (momentum filter)."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "5m"

    @property
    def scan_lookback_days(self) -> int:
        return 10

    @property
    def scan_live_when(self) -> str:
        return "cash_rth"

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "gap_pct": 0.02,
            "volume_mult": 2.0,
            "open_bars": 3,
            "avg_lookback_bars": 40,
            "timezone": "America/New_York",
        }

    def evaluate(
        self, candles: list[Candle], context: StrategyContext
    ) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        gap_pct = Decimal(str(params["gap_pct"]))
        vol_mult = Decimal(str(params["volume_mult"]))
        open_bars = max(1, int(params["open_bars"]))
        avg_lb = max(open_bars + 5, int(params["avg_lookback_bars"]))
        series = _rth(candles, tz)
        ticker = context.ticker

        def score_day(day: date) -> StrategyResult | None:
            day_bars = _day_bars(series, day, tz)
            if len(day_bars) < open_bars:
                return None
            prior = _prior_close(series, day, tz)
            if prior is None or prior <= 0:
                return None
            open_px = day_bars[0].open
            gap = (open_px - prior) / prior
            if abs(gap) < gap_pct:
                return None
            window = day_bars[:open_bars]
            open_vol = sum(
                (c.volume or Decimal("0") for c in window), Decimal("0")
            )
            hist = [
                c
                for c in series
                if local_ts(c.timestamp, tz).date() < day
            ][-avg_lb:]
            if len(hist) < 10:
                return None
            hist_nz = [c for c in hist if (c.volume or Decimal("0")) > 0]
            avg_vol = _avg_volume(hist_nz or hist) * open_bars
            if avg_vol <= 0:
                return None
            # If opening window volume is all Yahoo zeros, don't block the gap.
            if open_vol > 0 and open_vol < avg_vol * vol_mult:
                return None
            side = Side.LONG if gap > 0 else Side.SHORT
            bar = window[-1]
            return _hit(
                bar=bar,
                side=side,
                reason=(
                    f"CH01 Gap & Go gap={float(gap)*100:.2f}% "
                    f"vol×{float(open_vol / avg_vol):.1f}"
                ),
                ticker=ticker,
                day_bars=day_bars,
            )

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=series, score_day=score_day
        )


class Ch02VwapReversionStrategy(BaseStrategy):
    """Price ≥1.5σ from session VWAP and starting to revert toward it."""

    @property
    def name(self) -> str:
        return STRATEGY_CH02_VWAP_REV

    @property
    def description(self) -> str:
        return (
            "CH02 VWAP Reversion: price ≥1.5σ from intradía VWAP and "
            "reversing toward VWAP."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "5m"

    @property
    def scan_lookback_days(self) -> int:
        return 5

    @property
    def scan_live_when(self) -> str:
        return "cash_rth"

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "z_threshold": 1.5,
            "min_bars": 12,
            "timezone": "America/New_York",
        }

    def evaluate(
        self, candles: list[Candle], context: StrategyContext
    ) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        z_th = float(params["z_threshold"])
        min_bars = max(6, int(params["min_bars"]))
        series = _rth(candles, tz)
        ticker = context.ticker

        def score_day(day: date) -> StrategyResult | None:
            day_bars = _day_bars(series, day, tz)
            if len(day_bars) < min_bars:
                return None
            vwaps = session_vwap(day_bars)
            # Expanding σ from session start; first reversion after |z|≥th wins.
            diffs: list[float] = []
            for i, (c, v) in enumerate(zip(day_bars, vwaps)):
                if v is None:
                    continue
                diffs.append(float(c.close - v))
                if len(diffs) < min_bars or i < 1:
                    continue
                sd = pstdev(diffs) if len(diffs) > 1 else 0.0
                if sd <= 0 or vwaps[i - 1] is None:
                    continue
                z = float(c.close - v) / sd
                if abs(z) < z_th:
                    continue
                prev_dist = abs(float(day_bars[i - 1].close - vwaps[i - 1]))
                curr_dist = abs(float(c.close - v))
                if curr_dist >= prev_dist:
                    continue
                side = Side.LONG if z < 0 else Side.SHORT
                return _hit(
                    bar=c,
                    side=side,
                    reason=f"CH02 VWAP reversion z={z:.2f}",
                    ticker=ticker,
                    day_bars=day_bars,
                )
            return None

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=series, score_day=score_day
        )


class Ch03EmaCrossStrategy(BaseStrategy):
    """EMA9 crosses EMA20 on 5m with rising volume."""

    @property
    def name(self) -> str:
        return STRATEGY_CH03_EMA_CROSS

    @property
    def description(self) -> str:
        return (
            "CH03 EMA cross: EMA9 crosses EMA20 on 5m with rising volume."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "5m"

    @property
    def scan_lookback_days(self) -> int:
        return 10

    @property
    def scan_live_when(self) -> str:
        return "cash_rth"

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "fast": 9,
            "slow": 20,
            "timezone": "America/New_York",
        }

    def evaluate(
        self, candles: list[Candle], context: StrategyContext
    ) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        fast_n = int(params["fast"])
        slow_n = int(params["slow"])
        series = _rth(candles, tz)
        ticker = context.ticker
        closes = [c.close for c in series]
        fast = ema(closes, fast_n)
        slow = ema(closes, slow_n)

        def score_day(day: date) -> StrategyResult | None:
            idxs = [
                i
                for i, c in enumerate(series)
                if local_ts(c.timestamp, tz).date() == day
            ]
            if len(idxs) < 2:
                return None
            day_bars = [series[k] for k in idxs]
            # Walk the whole RTH day (first cross wins). Checking only the last
            # two bars made Analyzer backtests return 0 almost always.
            for n in range(1, len(idxs)):
                i = idxs[n]
                j = idxs[n - 1]
                if fast[i] is None or slow[i] is None:
                    continue
                if fast[j] is None or slow[j] is None:
                    continue
                bull_cross = fast[j] <= slow[j] and fast[i] > slow[i]
                bear_cross = fast[j] >= slow[j] and fast[i] < slow[i]
                if not bull_cross and not bear_cross:
                    continue
                vol_now = series[i].volume or Decimal("0")
                vol_prev = series[j].volume or Decimal("0")
                # Yahoo futures often print 0 volume on alternate bars — only
                # enforce rising vol when both bars have real volume.
                if vol_now > 0 and vol_prev > 0 and vol_now <= vol_prev:
                    continue
                side = Side.LONG if bull_cross else Side.SHORT
                return _hit(
                    bar=series[i],
                    side=side,
                    reason=(
                        f"CH03 EMA{fast_n}/{slow_n} "
                        f"{'bull' if bull_cross else 'bear'} cross + rising vol"
                    ),
                    ticker=ticker,
                    day_bars=day_bars,
                )
            return None

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=series, score_day=score_day
        )


class Ch04RsiExtremeStrategy(BaseStrategy):
    """RSI(14) ≤30 or ≥70 on 5m with decreasing volume on the extension."""

    @property
    def name(self) -> str:
        return STRATEGY_CH04_RSI_EXT

    @property
    def description(self) -> str:
        return (
            "CH04 RSI extreme: RSI(14) ≤30 / ≥70 on 5m with fading volume "
            "(exhaustion)."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "5m"

    @property
    def scan_lookback_days(self) -> int:
        return 10

    @property
    def scan_live_when(self) -> str:
        return "cash_rth"

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "rsi_period": 14,
            "oversold": 30,
            "overbought": 70,
            "vol_fade_bars": 3,
            "timezone": "America/New_York",
        }

    def evaluate(
        self, candles: list[Candle], context: StrategyContext
    ) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        period = int(params["rsi_period"])
        lo = Decimal(str(params["oversold"]))
        hi = Decimal(str(params["overbought"]))
        fade_n = max(2, int(params["vol_fade_bars"]))
        series = _rth(candles, tz)
        ticker = context.ticker
        rsis = rsi([c.close for c in series], period)

        def score_day(day: date) -> StrategyResult | None:
            idxs = [
                i
                for i, c in enumerate(series)
                if local_ts(c.timestamp, tz).date() == day
            ]
            if len(idxs) < fade_n:
                return None
            day_bars = [series[k] for k in idxs]
            # Walk RTH day — last-bar-only missed intraday RSI extremes.
            for n in range(fade_n - 1, len(idxs)):
                i = idxs[n]
                val = rsis[i]
                if val is None:
                    continue
                if val > lo and val < hi:
                    continue
                win = idxs[n - fade_n + 1 : n + 1]
                vols = [series[k].volume or Decimal("0") for k in win]
                # Soft fade: ignore zero-volume Yahoo glitches.
                nonzero = [v for v in vols if v > 0]
                if len(nonzero) >= 2:
                    if not all(
                        nonzero[k] >= nonzero[k + 1]
                        for k in range(len(nonzero) - 1)
                    ):
                        continue
                side = Side.LONG if val <= lo else Side.SHORT
                return _hit(
                    bar=series[i],
                    side=side,
                    reason=f"CH04 RSI={float(val):.1f} + volume fade",
                    ticker=ticker,
                    day_bars=day_bars,
                )
            return None

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=series, score_day=score_day
        )


def _resolve_bench_series(
    ticker: str,
    extras: dict[str, list[Candle]],
    tz: ZoneInfo,
) -> tuple[list[Candle], str]:
    """Pick RS benchmark candles: futures NQ↔ES, else SPY/QQQ."""
    sym = ticker.upper().split("=")[0]
    keys = _FUTURES_RS_BENCH.get(sym, _EQUITY_RS_BENCH)
    for key in keys:
        raw = extras.get(key)
        if raw:
            return _rth(list(raw), tz), key
    return [], ""


class Ch05RelStrengthStrategy(BaseStrategy):
    """
    Relative strength in the NY RTH morning window.
    Equity: vs SPY/QQQ when bench extras exist.
    Futures: vs paired index (MNQ↔MES) when present; else own 5d avg proxy.
    """

    @property
    def name(self) -> str:
        return STRATEGY_CH05_REL_STRENGTH

    @property
    def description(self) -> str:
        return (
            "CH05 Relative strength: outpaces SPY (equity) or ES/MES (NQ/MNQ) "
            "in the same RTH morning window; else vs own 5d average."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "5m"

    @property
    def scan_lookback_days(self) -> int:
        return 10

    @property
    def scan_live_when(self) -> str:
        return "cash_rth"

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "window_minutes": 60,
            "min_outperform_pp": 0.01,
            "timezone": "America/New_York",
        }

    def evaluate(
        self, candles: list[Candle], context: StrategyContext
    ) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        win_m = int(params["window_minutes"])
        min_pp = Decimal(str(params["min_outperform_pp"]))
        series = _rth(candles, tz)
        ticker = context.ticker
        extras = context.extra_candles or {}
        bench, bench_label = _resolve_bench_series(ticker, extras, tz)

        def _window_ret(bars: list[Candle], day: date) -> Decimal | None:
            day_bars = _day_bars(bars, day, tz)
            if len(day_bars) < 2:
                return None
            cutoff = time(
                9 + (30 + win_m) // 60,
                (30 + win_m) % 60,
            )
            window = [
                c
                for c in day_bars
                if local_ts(c.timestamp, tz).time() <= cutoff
            ]
            if len(window) < 2:
                window = day_bars[: max(2, min(12, len(day_bars)))]
            if len(window) < 2 or window[0].open <= 0:
                return None
            return (window[-1].close - window[0].open) / window[0].open

        def score_day(day: date) -> StrategyResult | None:
            ret = _window_ret(series, day)
            if ret is None:
                return None
            bench_ret = _window_ret(bench, day) if bench else None
            if bench_ret is not None:
                edge = ret - bench_ret
                label = f"vs {bench_label.replace('bench:', '')}"
            else:
                prior_days = sorted(
                    {
                        local_ts(c.timestamp, tz).date()
                        for c in series
                        if local_ts(c.timestamp, tz).date() < day
                    }
                )[-5:]
                priors = [
                    r
                    for d in prior_days
                    if (r := _window_ret(series, d)) is not None
                ]
                if len(priors) < 3:
                    return None
                avg = sum(priors, Decimal("0")) / len(priors)
                edge = ret - avg
                label = "vs own 5d avg"
            if abs(edge) < min_pp:
                return None
            side = Side.LONG if edge > 0 else Side.SHORT
            day_bars = _day_bars(series, day, tz)
            if not day_bars:
                return None
            return _hit(
                bar=day_bars[-1],
                side=side,
                reason=(
                    f"CH05 RS {label} edge={float(edge)*100:.2f}pp "
                    f"ret={float(ret)*100:.2f}%"
                ),
                ticker=ticker,
                day_bars=day_bars,
            )

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=series, score_day=score_day
        )


class Ch06OrbStrategy(BaseStrategy):
    """Break 15–30m opening range with volume confirmation."""

    @property
    def name(self) -> str:
        return STRATEGY_CH06_ORB

    @property
    def description(self) -> str:
        return (
            "CH06 ORB: break high/low of first 15–30m RTH range with "
            "volume confirmation."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "5m"

    @property
    def scan_lookback_days(self) -> int:
        return 5

    @property
    def scan_live_when(self) -> str:
        return "cash_rth"

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "opening_range_minutes": 15,
            "volume_mult": 1.2,
            "timezone": "America/New_York",
        }

    def evaluate(
        self, candles: list[Candle], context: StrategyContext
    ) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        range_m = max(5, int(params["opening_range_minutes"]))
        vol_mult = Decimal(str(params["volume_mult"]))
        series = _rth(candles, tz)
        ticker = context.ticker
        range_end = (
            datetime_combine_open(range_m)
        )

        def score_day(day: date) -> StrategyResult | None:
            day_bars = _day_bars(series, day, tz)
            if len(day_bars) < 4:
                return None
            or_bars = [
                c
                for c in day_bars
                if local_ts(c.timestamp, tz).time() < range_end
            ]
            post = [
                c
                for c in day_bars
                if local_ts(c.timestamp, tz).time() >= range_end
            ]
            if len(or_bars) < 1 or not post:
                return None
            hi = max(c.high for c in or_bars)
            lo = min(c.low for c in or_bars)
            or_vol = _avg_volume(or_bars)
            for c in post:
                vol = c.volume or Decimal("0")
                # Yahoo futures often print 0 volume — only enforce when both
                # OR avg and this bar have real volume.
                if or_vol > 0 and vol > 0 and vol < or_vol * vol_mult:
                    continue
                if c.close > hi:
                    return _hit(
                        bar=c,
                        side=Side.LONG,
                        reason=(
                            f"CH06 ORB break high ({range_m}m) "
                            f"vol confirm"
                        ),
                        ticker=ticker,
                        day_bars=day_bars,
                    )
                if c.close < lo:
                    return _hit(
                        bar=c,
                        side=Side.SHORT,
                        reason=(
                            f"CH06 ORB break low ({range_m}m) "
                            f"vol confirm"
                        ),
                        ticker=ticker,
                        day_bars=day_bars,
                    )
            return None

        return evaluate_each_session_day(
            context, tz=tz, candles_for_days=series, score_day=score_day
        )


def datetime_combine_open(range_minutes: int) -> time:
    """RTH open + range_minutes → clock time (NY)."""
    total = 9 * 60 + 30 + range_minutes
    return time(total // 60, total % 60)


ALL_CH_STRATEGIES: list[BaseStrategy] = [
    Ch01GapGoStrategy(),
    Ch02VwapReversionStrategy(),
    Ch03EmaCrossStrategy(),
    Ch04RsiExtremeStrategy(),
    Ch05RelStrengthStrategy(),
    Ch06OrbStrategy(),
]

"""E03 — Magnet / gap toward MA20 on Hora (CALL/PUT → LONG/SHORT)."""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal
from zoneinfo import ZoneInfo

from app.core.constants import STRATEGY_E03_MAGNET
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.rth_bars import bar_is_complete
from app.domain.signals import Signal
from app.domain.strategy_types import StrategyContext, StrategyMetrics, StrategyResult
from app.indicators import bollinger, sma
from app.strategies.base import BaseStrategy

RTH_OPEN = time(9, 30)
RTH_CLOSE = time(16, 0)

Trend = Literal["bull", "bear"]


class MagnetMa20GapStrategy(BaseStrategy):
    """
    E03 heuristics (v1 scan — Worden Stoch volume deferred to checklist):

    1. Hora: MA20/MA40 clearly trending and separated for ≥2 session days.
    2. Open gap leaves price unusually far from last Hora MA20.
    3. First RTH 15m bar fully outside Bollinger (mecha included).
    4. Direction: bull trend + gap up → SHORT (PUT); bear + gap down → LONG (CALL).

    Optional soft confirm: first 15m volume above recent average (not Worden).
    """

    @property
    def name(self) -> str:
        return STRATEGY_E03_MAGNET

    @property
    def description(self) -> str:
        return (
            "E03 Magnet gap: Hora MA20/40 trend + extreme open away from MA20 + "
            "first 15m fully outside BB (LONG=CALL / SHORT=PUT). Worden Stoch manual."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "15m"

    @property
    def scan_lookback_days(self) -> int:
        return 12

    @property
    def scan_extra_timeframes(self) -> tuple[str, ...]:
        return ("1h",)

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "ma_fast": 20,
            "ma_slow": 40,
            "min_trend_days": 2,
            "min_ma_sep_pct": 0.002,  # |MA20-MA40|/price
            "min_gap_from_ma20_pct": 0.012,  # open vs MA20 Hora
            "bb_period": 20,
            "bb_std": 2.0,
            "require_volume_surge": False,
            "volume_surge_mult": 1.2,
            "timezone": "America/New_York",
        }

    def evaluate(
        self,
        candles: list[Candle],
        context: StrategyContext,
    ) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz = ZoneInfo(str(params.get("timezone") or context.timezone))
        session_day = _as_date(context.end)

        h1 = [
            c
            for c in sorted(context.extra_candles.get("1h", []), key=lambda x: x.timestamp)
            if RTH_OPEN <= _local(c.timestamp, tz).time() < RTH_CLOSE
        ]
        m15 = [
            c
            for c in sorted(candles, key=lambda x: x.timestamp)
            if RTH_OPEN <= _local(c.timestamp, tz).time() < RTH_CLOSE
        ]
        if not h1 or not m15:
            return StrategyResult()

        trend = _hora_trend(
            h1,
            tz=tz,
            session_day=session_day,
            ma_fast=int(params["ma_fast"]),
            ma_slow=int(params["ma_slow"]),
            min_trend_days=int(params["min_trend_days"]),
            min_sep_pct=Decimal(str(params["min_ma_sep_pct"])),
        )
        if trend is None:
            return StrategyResult()

        ma20_last = _last_ma_before_session(
            h1,
            tz=tz,
            session_day=session_day,
            period=int(params["ma_fast"]),
        )
        if ma20_last is None:
            return StrategyResult()

        today_m15 = [
            c for c in m15 if _local(c.timestamp, tz).date() == session_day
        ]
        if not today_m15:
            return StrategyResult()
        first = today_m15[0]
        first_local = _local(first.timestamp, tz)
        if first_local.time() >= time(9, 45):
            return StrategyResult()
        # Playbook: never confirm on a forming open bar
        if not bar_is_complete(first, m15, tz=tz, bar_minutes=15):
            return StrategyResult()

        gap_pct = abs(first.open - ma20_last) / ma20_last if ma20_last else Decimal("0")
        min_gap = Decimal(str(params["min_gap_from_ma20_pct"]))
        if gap_pct < min_gap:
            return StrategyResult()

        # BB on all 15m including warm-up; evaluate first today bar vs bands
        closes = [c.close for c in m15]
        bands = bollinger(
            closes,
            period=int(params["bb_period"]),
            std_mult=float(params["bb_std"]),
        )
        first_i = next(i for i, c in enumerate(m15) if c.timestamp == first.timestamp)
        # Prefer prior bar BB envelope if available (gap vs yesterday structure)
        band_i = first_i - 1 if first_i > 0 else first_i
        band = bands[band_i]
        if band.upper is None or band.lower is None:
            return StrategyResult()

        fully_above = first.low > band.upper
        fully_below = first.high < band.lower

        if bool(params.get("require_volume_surge")):
            prior_vols = [c.volume for c in m15[:first_i][-20:]]
            if prior_vols:
                avg_vol = sum(prior_vols, Decimal("0")) / len(prior_vols)
                if first.volume < avg_vol * Decimal(str(params["volume_surge_mult"])):
                    return StrategyResult()

        side: Side | None = None
        reason = ""
        # Bull trend + gap up extreme + outside upper → PUT/SHORT (magnet down to MA20)
        if trend == "bull" and first.open > ma20_last and fully_above:
            side = Side.SHORT
            reason = (
                "E03 PUT setup: Hora bull MA20/40 + gap far above MA20 + "
                "first 15m fully outside upper BB (magnet toward MA20H)"
            )
        # Bear + gap down + outside lower → CALL/LONG
        elif trend == "bear" and first.open < ma20_last and fully_below:
            side = Side.LONG
            reason = (
                "E03 CALL setup: Hora bear MA20/40 + gap far below MA20 + "
                "first 15m fully outside lower BB (magnet toward MA20H)"
            )
        else:
            return StrategyResult()

        return StrategyResult(
            signals=[
                Signal(
                    timestamp=first.timestamp,
                    side=side,
                    price=first.close,
                    reason=reason,
                    ticker=context.ticker,
                )
            ],
            trades=[],
            metrics=StrategyMetrics(),
        )


def _hora_trend(
    h1: list[Candle],
    *,
    tz: ZoneInfo,
    session_day: date,
    ma_fast: int,
    ma_slow: int,
    min_trend_days: int,
    min_sep_pct: Decimal,
) -> Trend | None:
    closes = [c.close for c in h1]
    fast = sma(closes, ma_fast)
    slow = sma(closes, ma_slow)

    # Bars strictly before session open day
    prior_idxs = [
        i
        for i, c in enumerate(h1)
        if _local(c.timestamp, tz).date() < session_day
        and fast[i] is not None
        and slow[i] is not None
    ]
    if len(prior_idxs) < ma_slow:
        return None

    # Walk back from last prior bar — require consistent side + separation
    days: set[date] = set()
    side: Trend | None = None
    for i in reversed(prior_idxs):
        f, s = fast[i], slow[i]
        assert f is not None and s is not None
        px = closes[i]
        sep = abs(f - s) / px if px else Decimal("0")
        if sep < min_sep_pct:
            break
        cur: Trend = "bull" if f > s else "bear"
        if side is None:
            side = cur
        elif cur != side:
            break
        days.add(_local(h1[i].timestamp, tz).date())
        if len(days) >= min_trend_days:
            return side
    return None


def _last_ma_before_session(
    h1: list[Candle],
    *,
    tz: ZoneInfo,
    session_day: date,
    period: int,
) -> Decimal | None:
    closes = [c.close for c in h1]
    series = sma(closes, period)
    for i in range(len(h1) - 1, -1, -1):
        if _local(h1[i].timestamp, tz).date() < session_day and series[i] is not None:
            return series[i]
    return None


def _local(ts: datetime, tz: ZoneInfo) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=tz)
    return ts.astimezone(tz)


def _as_date(value: date | datetime) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value

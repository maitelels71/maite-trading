"""E01 — Bollinger mid trend flip on Hora (CALL/PUT → LONG/SHORT)."""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal
from zoneinfo import ZoneInfo

from app.core.constants import STRATEGY_E01_BB_FLIP
from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.rth_bars import bar_is_complete
from app.domain.signals import Signal
from app.domain.strategy_types import StrategyContext, StrategyMetrics, StrategyResult
from app.domain.trades import Trade
from app.indicators import bollinger
from app.strategies.base import BaseStrategy

RTH_OPEN = time(9, 30)
RTH_CLOSE = time(16, 0)
Trend = Literal["bull", "bear"]


class BbTrendFlipHStrategy(BaseStrategy):
    """
    E01 heuristics (v1 — drawn trendline stays checklist):

    1. Prior Hora BB mid trending ≥2 session days (down for CALL / up for PUT).
    2. A completed Hora bar closes across the BB mid (flip).
    3. Strong body candle (not doji) as stand-in for clean break.
    4. 15m BB mid already leaning the new direction.

    Manual: trendline A→B touch count remains in the playbook checklist.

    Evaluate / scan: scores session days in [context.start, context.end].
    Analyzer backtest: pass the full range so every day is scored; live scan
    should pass start=end=scan_day while still loading lookback candles.
    """

    @property
    def name(self) -> str:
        return STRATEGY_E01_BB_FLIP

    @property
    def description(self) -> str:
        return (
            "E01 BB H flip: prior Hora mid trend ≥2d + completed mid break + "
            "15m mid aligned (LONG=CALL / SHORT=PUT). Trendline manual."
        )

    @property
    def scan_timeframe(self) -> str | None:
        return "1h"

    @property
    def scan_lookback_days(self) -> int:
        return 12

    @property
    def scan_extra_timeframes(self) -> tuple[str, ...]:
        return ("15m",)

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "bb_period": 20,
            "bb_std": 2.0,
            "min_trend_days": 2,
            "min_mid_change_pct": 0.004,
            "min_body_pct": 0.0015,
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
        start_day = _as_date(context.start)
        end_day = _as_date(context.end)

        h1 = [
            c
            for c in sorted(candles, key=lambda x: x.timestamp)
            if RTH_OPEN <= _local(c.timestamp, tz).time() < RTH_CLOSE
        ]
        m15 = [
            c
            for c in sorted(context.extra_candles.get("15m", []), key=lambda x: x.timestamp)
            if RTH_OPEN <= _local(c.timestamp, tz).time() < RTH_CLOSE
        ]
        if len(h1) < bb_period + 8:
            return StrategyResult()

        closes = [c.close for c in h1]
        bands = bollinger(closes, period=bb_period, std_mult=bb_std)

        session_days = sorted(
            {
                _local(c.timestamp, tz).date()
                for c in h1
                if start_day <= _local(c.timestamp, tz).date() <= end_day
            }
        )

        signals: list[Signal] = []
        trades: list[Trade] = []
        for session_day in session_days:
            hit = _score_session(
                h1,
                bands,
                closes,
                m15,
                tz=tz,
                session_day=session_day,
                params=params,
                ticker=context.ticker,
            )
            if hit is None:
                continue
            signals.append(hit[0])
            trades.append(hit[1])

        return StrategyResult(
            signals=signals,
            trades=trades,
            metrics=_metrics(trades),
        )


def _score_session(
    h1: list[Candle],
    bands: list,
    closes: list[Decimal],
    m15: list[Candle],
    *,
    tz: ZoneInfo,
    session_day: date,
    params: dict[str, Any],
    ticker: str,
) -> tuple[Signal, Trade] | None:
    prior_trend = _prior_mid_trend(
        h1,
        bands,
        tz=tz,
        session_day=session_day,
        min_days=int(params["min_trend_days"]),
        min_chg=Decimal(str(params["min_mid_change_pct"])),
    )
    if prior_trend is None:
        return None

    today = [
        (i, c)
        for i, c in enumerate(h1)
        if _local(c.timestamp, tz).date() == session_day and bands[i].mid is not None
    ]
    if not today:
        return None

    min_body = Decimal(str(params["min_body_pct"]))
    flip_i: int | None = None
    flip_side: Side | None = None
    for i, c in today:
        if not bar_is_complete(c, h1, tz=tz):
            continue
        level = bands[i - 1].mid if i > 0 else bands[i].mid
        if level is None:
            continue
        body = abs(c.close - c.open)
        if c.close == 0 or body / c.close < min_body:
            continue
        if prior_trend == "bear" and c.close > level and c.close > c.open:
            if closes[i - 1] <= level or c.open <= level:
                flip_i, flip_side = i, Side.LONG
                break
        if prior_trend == "bull" and c.close < level and c.close < c.open:
            if closes[i - 1] >= level or c.open >= level:
                flip_i, flip_side = i, Side.SHORT
                break
    if flip_i is None or flip_side is None:
        return None

    # Live hold / invalidation: do not keep a stale morning flip as a desk match
    # after price closes back through the Hora BB mid (AAPL 10:00 break → 11:40 fade).
    later_done = [
        (i, c)
        for i, c in today
        if i >= flip_i and bar_is_complete(c, h1, tz=tz)
    ]
    if later_done:
        hold_i, hold_bar = later_done[-1]
        hold_mid = bands[hold_i].mid
        if hold_mid is None:
            return None
        if flip_side is Side.LONG and hold_bar.close < hold_mid:
            return None
        if flip_side is Side.SHORT and hold_bar.close > hold_mid:
            return None

    if m15:
        m_closes = [c.close for c in m15]
        bb_period = int(params["bb_period"])
        bb_std = float(params["bb_std"])
        m_bands = bollinger(m_closes, period=bb_period, std_mult=bb_std)
        sess_m = [
            (j, c)
            for j, c in enumerate(m15)
            if _local(c.timestamp, tz).date() == session_day
            and m_bands[j].mid is not None
            and bar_is_complete(c, m15, tz=tz, bar_minutes=15)
        ]
        if len(sess_m) >= 3:
            m0 = m_bands[sess_m[0][0]].mid
            m1 = m_bands[sess_m[-1][0]].mid
            assert m0 is not None and m1 is not None
            if flip_side is Side.LONG and m1 < m0:
                return None
            if flip_side is Side.SHORT and m1 > m0:
                return None
            # Also require last completed 15m still on the flip side of its mid
            lj, last15 = sess_m[-1]
            last_mid = m_bands[lj].mid
            if last_mid is not None:
                if flip_side is Side.LONG and last15.close < last_mid:
                    return None
                if flip_side is Side.SHORT and last15.close > last_mid:
                    return None

    bar = h1[flip_i]
    reason = (
        "E01 CALL setup: prior 1H BB mid down ≥2d + completed mid break up "
        "(trendline still checklist) · still holding above mid"
        if flip_side is Side.LONG
        else "E01 PUT setup: prior 1H BB mid up ≥2d + completed mid break down "
        "(trendline still checklist) · still holding below mid"
    )
    # Exit at last *completed* RTH Hora of the session for PnL snapshot.
    exit_bar = later_done[-1][1] if later_done else bar
    pnl = (
        (exit_bar.close - bar.close)
        if flip_side is Side.LONG
        else (bar.close - exit_bar.close)
    )
    signal = Signal(
        timestamp=bar.timestamp,
        side=flip_side,
        price=bar.close,
        reason=reason,
        ticker=ticker,
    )
    trade = Trade(
        side=flip_side,
        entry_time=bar.timestamp,
        entry_price=bar.close,
        signal=reason,
        exit_time=exit_bar.timestamp,
        exit_price=exit_bar.close,
        profit_loss=pnl,
        notes="E01 same-session exit at last completed RTH 1h bar",
    )
    return signal, trade


def _metrics(trades: list[Trade]) -> StrategyMetrics:
    closed = [t for t in trades if t.profit_loss is not None]
    if not closed:
        return StrategyMetrics()
    wins = [t for t in closed if t.profit_loss and t.profit_loss > 0]
    losses = [t for t in closed if t.profit_loss and t.profit_loss <= 0]
    total_pnl = sum((t.profit_loss or Decimal("0") for t in closed), Decimal("0"))
    equity = Decimal("0")
    peak = Decimal("0")
    max_dd = Decimal("0")
    for t in closed:
        equity += t.profit_loss or Decimal("0")
        if equity > peak:
            peak = equity
        dd = peak - equity
        if dd > max_dd:
            max_dd = dd
    return StrategyMetrics(
        total_trades=len(closed),
        winning_trades=len(wins),
        losing_trades=len(losses),
        win_rate=len(wins) / len(closed) if closed else 0.0,
        profit_loss=total_pnl,
        max_drawdown=max_dd,
    )


def _prior_mid_trend(
    h1: list[Candle],
    bands: list,
    *,
    tz: ZoneInfo,
    session_day: date,
    min_days: int,
    min_chg: Decimal,
) -> Trend | None:
    prior = [
        i
        for i, c in enumerate(h1)
        if _local(c.timestamp, tz).date() < session_day and bands[i].mid is not None
    ]
    if len(prior) < 8:
        return None
    days: dict[date, list[int]] = {}
    for i in prior:
        days.setdefault(_local(h1[i].timestamp, tz).date(), []).append(i)
    day_list = sorted(days)
    if len(day_list) < min_days:
        return None
    first_day_idxs = days[day_list[-min_days]]
    last_day_idxs = days[day_list[-1]]
    m0 = bands[first_day_idxs[0]].mid
    m1 = bands[last_day_idxs[-1]].mid
    if m0 is None or m1 is None or m0 == 0:
        return None
    chg = (m1 - m0) / m0
    if chg <= -min_chg:
        return "bear"
    if chg >= min_chg:
        return "bull"
    return None


def _local(ts: datetime, tz: ZoneInfo) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=tz)
    return ts.astimezone(tz)


def _as_date(value: date | datetime) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value

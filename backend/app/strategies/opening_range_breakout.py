"""Opening Range Breakout — long and short, US RTH session."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from app.core.constants import DEFAULT_OPENING_RANGE_MINUTES, STRATEGY_ORB
from app.domain.candles import Candle
from app.domain.enums import SessionType, Side
from app.domain.signals import Signal
from app.domain.strategy_types import StrategyContext, StrategyMetrics, StrategyResult
from app.domain.trades import Trade
from app.strategies.base import BaseStrategy

RTH_OPEN = time(9, 30)
RTH_CLOSE = time(16, 0)


class OpeningRangeBreakoutStrategy(BaseStrategy):
    """
    ORB rules (v1):
    1. Use America/New_York RTH session.
    2. Opening range = first N minutes after 09:30 (default 5).
    3. Breakout above range high → long.
    4. Breakout below range low → short.
    5. One position at a time; opposite breakout closes and reverses.
    6. Flat at RTH close (end_of_session).
    """

    @property
    def name(self) -> str:
        return STRATEGY_ORB

    @property
    def description(self) -> str:
        return (
            "Opening Range Breakout (long and short) using US RTH session "
            "in America/New_York."
        )

    @property
    def default_parameters(self) -> dict[str, Any]:
        return {
            "opening_range_minutes": DEFAULT_OPENING_RANGE_MINUTES,
            "session": SessionType.RTH.value,
            "timezone": "America/New_York",
            "exit_policy": "end_of_session",
        }

    def evaluate(
        self,
        candles: list[Candle],
        context: StrategyContext,
    ) -> StrategyResult:
        params = {**self.default_parameters, **(context.parameters or {})}
        tz_name = str(params.get("timezone") or context.timezone)
        tz = ZoneInfo(tz_name)
        range_minutes = int(params.get("opening_range_minutes", DEFAULT_OPENING_RANGE_MINUTES))
        exit_policy = str(params.get("exit_policy", "end_of_session"))

        if not candles:
            return StrategyResult()

        session_days = _group_by_session_day(candles, tz)
        signals: list[Signal] = []
        trades: list[Trade] = []

        for _day, day_candles in sorted(session_days.items()):
            day_signals, day_trades = _evaluate_session(
                day_candles,
                ticker=context.ticker,
                tz=tz,
                range_minutes=range_minutes,
                exit_policy=exit_policy,
            )
            signals.extend(day_signals)
            trades.extend(day_trades)

        return StrategyResult(
            signals=signals,
            trades=trades,
            metrics=_compute_metrics(trades),
        )


def _ensure_aware(ts: datetime, tz: ZoneInfo) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=tz)
    return ts.astimezone(tz)


def _group_by_session_day(
    candles: list[Candle],
    tz: ZoneInfo,
) -> dict[date, list[Candle]]:
    grouped: dict[date, list[Candle]] = {}
    for c in sorted(candles, key=lambda x: x.timestamp):
        local = _ensure_aware(c.timestamp, tz)
        # RTH session date is the local calendar date.
        grouped.setdefault(local.date(), []).append(c)
    return grouped


def _evaluate_session(
    candles: list[Candle],
    *,
    ticker: str,
    tz: ZoneInfo,
    range_minutes: int,
    exit_policy: str,
) -> tuple[list[Signal], list[Trade]]:
    rth: list[Candle] = []
    for c in candles:
        local_t = _ensure_aware(c.timestamp, tz).time()
        if RTH_OPEN <= local_t < RTH_CLOSE:
            rth.append(c)

    if not rth:
        return [], []

    session_date = _ensure_aware(rth[0].timestamp, tz).date()
    range_start = datetime.combine(session_date, RTH_OPEN, tzinfo=tz)
    range_end = range_start + timedelta(minutes=range_minutes)

    opening = [
        c
        for c in rth
        if range_start <= _ensure_aware(c.timestamp, tz) < range_end
    ]
    if not opening:
        return [], []

    range_high = max(c.high for c in opening)
    range_low = min(c.low for c in opening)

    signals: list[Signal] = []
    trades: list[Trade] = []
    open_side: Side | None = None
    entry_price: Decimal | None = None
    entry_time: datetime | None = None
    entry_signal = ""

    post_range = [
        c
        for c in rth
        if _ensure_aware(c.timestamp, tz) >= range_end
    ]

    def close_trade(exit_c: Candle, reason: str) -> None:
        nonlocal open_side, entry_price, entry_time, entry_signal
        if open_side is None or entry_price is None or entry_time is None:
            return
        pnl = (
            exit_c.close - entry_price
            if open_side is Side.LONG
            else entry_price - exit_c.close
        )
        trades.append(
            Trade(
                side=open_side,
                entry_time=entry_time,
                entry_price=entry_price,
                signal=entry_signal,
                exit_time=exit_c.timestamp,
                exit_price=exit_c.close,
                profit_loss=pnl,
                notes=reason,
            )
        )
        open_side = None
        entry_price = None
        entry_time = None
        entry_signal = ""

    for c in post_range:
        # Breakout detection uses candle high/low; fill at close (v1 fill model).
        long_break = c.high > range_high
        short_break = c.low < range_low

        if open_side is None:
            if long_break and not short_break:
                open_side = Side.LONG
                entry_price = c.close
                entry_time = c.timestamp
                entry_signal = "breakout_high"
                signals.append(
                    Signal(
                        timestamp=c.timestamp,
                        side=Side.LONG,
                        price=c.close,
                        reason="breakout above opening range high",
                        ticker=ticker,
                    )
                )
            elif short_break and not long_break:
                open_side = Side.SHORT
                entry_price = c.close
                entry_time = c.timestamp
                entry_signal = "breakout_low"
                signals.append(
                    Signal(
                        timestamp=c.timestamp,
                        side=Side.SHORT,
                        price=c.close,
                        reason="breakout below opening range low",
                        ticker=ticker,
                    )
                )
            continue

        # Reverse on opposite breakout
        if open_side is Side.LONG and short_break:
            close_trade(c, "reverse on breakout_low")
            open_side = Side.SHORT
            entry_price = c.close
            entry_time = c.timestamp
            entry_signal = "breakout_low"
            signals.append(
                Signal(
                    timestamp=c.timestamp,
                    side=Side.SHORT,
                    price=c.close,
                    reason="reverse short on breakout below opening range low",
                    ticker=ticker,
                )
            )
        elif open_side is Side.SHORT and long_break:
            close_trade(c, "reverse on breakout_high")
            open_side = Side.LONG
            entry_price = c.close
            entry_time = c.timestamp
            entry_signal = "breakout_high"
            signals.append(
                Signal(
                    timestamp=c.timestamp,
                    side=Side.LONG,
                    price=c.close,
                    reason="reverse long on breakout above opening range high",
                    ticker=ticker,
                )
            )

    if open_side is not None and exit_policy == "end_of_session" and post_range:
        last = post_range[-1]
        close_trade(last, "end_of_session flat")
        signals.append(
            Signal(
                timestamp=last.timestamp,
                side=Side.FLAT,
                price=last.close,
                reason="flatten at end of RTH session",
                ticker=ticker,
            )
        )

    return signals, trades


def _compute_metrics(trades: list[Trade]) -> StrategyMetrics:
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

    win_rate = len(wins) / len(closed) if closed else 0.0
    return StrategyMetrics(
        total_trades=len(closed),
        winning_trades=len(wins),
        losing_trades=len(losses),
        win_rate=win_rate,
        profit_loss=total_pnl,
        max_drawdown=max_dd,
    )

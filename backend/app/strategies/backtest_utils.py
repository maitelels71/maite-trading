"""Shared helpers so Analyzer backtests walk history and report win-rate/PnL."""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Callable
from zoneinfo import ZoneInfo

from app.domain.candles import Candle
from app.domain.enums import Side
from app.domain.signals import Signal
from app.domain.strategy_types import StrategyContext, StrategyMetrics, StrategyResult
from app.domain.trades import Trade

RTH_OPEN = time(9, 30)
RTH_CLOSE = time(16, 0)

DayScorer = Callable[[date], StrategyResult | None]


def local_ts(ts: datetime, tz: ZoneInfo) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=tz)
    return ts.astimezone(tz)


def as_date(value: date | datetime) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value


def session_days_in_range(
    candles: list[Candle],
    *,
    start: date,
    end: date,
    tz: ZoneInfo,
) -> list[date]:
    days = {
        local_ts(c.timestamp, tz).date()
        for c in candles
        if start <= local_ts(c.timestamp, tz).date() <= end
    }
    return sorted(days)


def metrics_from_trades(trades: list[Trade]) -> StrategyMetrics:
    closed = [t for t in trades if t.profit_loss is not None]
    if not closed:
        return StrategyMetrics(
            total_trades=len(trades),
            winning_trades=0,
            losing_trades=0,
            win_rate=0.0,
            profit_loss=Decimal("0"),
            max_drawdown=Decimal("0"),
        )
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
        win_rate=(len(wins) / len(closed)) if closed else 0.0,
        profit_loss=total_pnl,
        max_drawdown=max_dd,
    )


def pnl_for_side(
    side: Side,
    entry: Decimal,
    exit_px: Decimal,
) -> Decimal:
    if side is Side.LONG:
        return exit_px - entry
    return entry - exit_px


def closed_trade(
    *,
    side: Side,
    entry: Candle,
    exit_bar: Candle,
    reason: str,
    notes: str | None = None,
) -> Trade:
    pnl = pnl_for_side(side, entry.close, exit_bar.close)
    return Trade(
        side=side,
        entry_time=entry.timestamp,
        entry_price=entry.close,
        signal=reason,
        exit_time=exit_bar.timestamp,
        exit_price=exit_bar.close,
        profit_loss=pnl,
        notes=notes,
    )


def signal_and_session_trade(
    *,
    bar: Candle,
    side: Side,
    reason: str,
    ticker: str,
    day_bars: list[Candle],
    notes: str | None = None,
) -> StrategyResult:
    """One signal + trade closed at last bar of the session day (or entry bar)."""
    exit_bar = day_bars[-1] if day_bars else bar
    trade = closed_trade(
        side=side,
        entry=bar,
        exit_bar=exit_bar,
        reason=reason,
        notes=notes or "Session snapshot exit (last bar of day)",
    )
    return StrategyResult(
        signals=[
            Signal(
                timestamp=bar.timestamp,
                side=side,
                price=bar.close,
                reason=reason,
                ticker=ticker,
            )
        ],
        trades=[trade],
        metrics=metrics_from_trades([trade]),
    )


def merge_day_results(parts: list[StrategyResult]) -> StrategyResult:
    signals: list[Signal] = []
    trades: list[Trade] = []
    for part in parts:
        signals.extend(part.signals)
        trades.extend(part.trades)
    return StrategyResult(
        signals=signals,
        trades=trades,
        metrics=metrics_from_trades(trades),
    )


def evaluate_each_session_day(
    context: StrategyContext,
    *,
    tz: ZoneInfo,
    candles_for_days: list[Candle],
    score_day: DayScorer,
) -> StrategyResult:
    """
    Historical backtest contract:
    - Walk every session day in [context.start, context.end]
    - Live scan passes start=end=session_day (still one day)
    - ``score_day`` returns a single-day StrategyResult or None
    """
    start = as_date(context.start)
    end = as_date(context.end)
    days = session_days_in_range(
        candles_for_days, start=start, end=end, tz=tz
    )
    if not days:
        # Fallback: still attempt end date (empty candle window)
        days = [end]
    parts: list[StrategyResult] = []
    for day in days:
        hit = score_day(day)
        if hit and (hit.signals or hit.trades):
            parts.append(hit)
    return merge_day_results(parts) if parts else StrategyResult()

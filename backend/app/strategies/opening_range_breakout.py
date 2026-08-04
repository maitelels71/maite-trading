"""Opening Range Breakout strategy — long + short, RTH America/New_York."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import List, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo

from app.core.constants import (
    APP_TIMEZONE,
    DEFAULT_OPENING_RANGE_MINUTES,
    RTH_SESSION_END,
    RTH_SESSION_START,
    STRATEGY_ORB,
)
from app.domain.candles import Candle
from app.domain.enums import Side, SignalType
from app.domain.signals import Signal
from app.domain.strategy_types import StrategyParams, StrategyResult
from app.domain.trades import Trade
from app.strategies.base import BaseStrategy


def _session_bounds(day: date, tz: ZoneInfo) -> Tuple[datetime, datetime]:
    start = datetime.combine(day, time(*RTH_SESSION_START), tzinfo=tz)
    end = datetime.combine(day, time(*RTH_SESSION_END), tzinfo=tz)
    return start, end


def is_rth(ts: datetime, tz: ZoneInfo = APP_TIMEZONE) -> bool:
    local = ts.astimezone(tz)
    start, end = _session_bounds(local.date(), tz)
    return start <= local < end


class OpeningRangeBreakoutStrategy(BaseStrategy):
    """
    ORB rules:
    - Regular trading hours 09:30–16:00 America/New_York
    - Opening range = first N minutes (default 5)
    - Long when price breaks above range high
    - Short when price breaks below range low
    - Reverse on opposite break
    - Flatten at end of RTH session
    - Fills at candle close
    """

    id = STRATEGY_ORB
    name = "Opening Range Breakout"
    description = (
        "Trades breakouts of the opening range during US RTH. "
        "Supports long and short with end-of-session flatten."
    )

    def default_params(self) -> StrategyParams:
        return StrategyParams(opening_range_minutes=DEFAULT_OPENING_RANGE_MINUTES)

    def evaluate(
        self,
        symbol: str,
        candles: Sequence[Candle],
        params: StrategyParams | None = None,
    ) -> StrategyResult:
        params = (params or self.default_params()).validated()
        ordered = self.prepare_candles(candles)
        result = StrategyResult(
            strategy_id=self.id,
            symbol=symbol,
            params=params,
            started_at=ordered[0].timestamp if ordered else None,
            ended_at=ordered[-1].timestamp if ordered else None,
        )
        if not ordered:
            return result

        tz = APP_TIMEZONE
        signals: List[Signal] = []
        trades: List[Trade] = []
        position: Optional[Trade] = None

        # Group by session date in ET
        by_day: dict[date, list[Candle]] = {}
        for candle in ordered:
            local = candle.timestamp.astimezone(tz)
            if not is_rth(local, tz):
                continue
            by_day.setdefault(local.date(), []).append(candle)

        for day, day_candles in sorted(by_day.items(), key=lambda kv: kv[0]):
            session_start, session_end = _session_bounds(day, tz)
            range_end = session_start + timedelta(minutes=params.opening_range_minutes)

            opening = [c for c in day_candles if session_start <= c.timestamp.astimezone(tz) < range_end]
            tradeable = [c for c in day_candles if c.timestamp.astimezone(tz) >= range_end]

            if not opening:
                # No opening range formed — skip day
                if position is not None:
                    # Still flatten if somehow carrying (should not across days)
                    self._flatten(
                        position,
                        day_candles[-1],
                        signals,
                        reason="no_opening_range_carry_flatten",
                    )
                    trades.append(position)
                    position = None
                continue

            range_high = max(c.high for c in opening)
            range_low = min(c.low for c in opening)
            position = None  # flat at start of each session

            for candle in tradeable:
                local_ts = candle.timestamp.astimezone(tz)
                fill = candle.close

                # Session end flatten on last RTH bar or when we hit session_end
                if local_ts >= session_end - timedelta(minutes=1) or local_ts >= session_end:
                    if position is not None and position.is_open:
                        self._flatten(position, candle, signals, reason="end_of_session")
                        trades.append(position)
                        position = None
                    continue

                broke_high = candle.close > range_high
                broke_low = candle.close < range_low

                if position is None:
                    if broke_high and params.allow_long:
                        position = self._open(
                            symbol,
                            Side.LONG,
                            params.quantity,
                            fill,
                            candle.timestamp,
                            signals,
                            SignalType.ENTRY_LONG,
                            reason="break_above_opening_range_high",
                            meta={"range_high": str(range_high), "range_low": str(range_low)},
                        )
                    elif broke_low and params.allow_short:
                        position = self._open(
                            symbol,
                            Side.SHORT,
                            params.quantity,
                            fill,
                            candle.timestamp,
                            signals,
                            SignalType.ENTRY_SHORT,
                            reason="break_below_opening_range_low",
                            meta={"range_high": str(range_high), "range_low": str(range_low)},
                        )
                    continue

                # Reverse / manage open position
                if position.side == Side.LONG and broke_low and params.allow_short:
                    self._flatten(position, candle, signals, reason="reverse_to_short")
                    trades.append(position)
                    position = self._open(
                        symbol,
                        Side.SHORT,
                        params.quantity,
                        fill,
                        candle.timestamp,
                        signals,
                        SignalType.REVERSE_TO_SHORT,
                        reason="reverse_to_short",
                        meta={"range_high": str(range_high), "range_low": str(range_low)},
                    )
                elif position.side == Side.SHORT and broke_high and params.allow_long:
                    self._flatten(position, candle, signals, reason="reverse_to_long")
                    trades.append(position)
                    position = self._open(
                        symbol,
                        Side.LONG,
                        params.quantity,
                        fill,
                        candle.timestamp,
                        signals,
                        SignalType.REVERSE_TO_LONG,
                        reason="reverse_to_long",
                        meta={"range_high": str(range_high), "range_low": str(range_low)},
                    )

            # Flatten at end of session if still open
            if params.flatten_at_session_end and position is not None and position.is_open:
                last = day_candles[-1]
                self._flatten(position, last, signals, reason="end_of_session")
                trades.append(position)
                position = None

        result.signals = signals
        result.trades = trades
        result.metadata = {
            "sessions": len(by_day),
            "opening_range_minutes": params.opening_range_minutes,
            "timezone": str(tz),
        }
        return result

    def _open(
        self,
        symbol: str,
        side: Side,
        quantity: Decimal,
        price: Decimal,
        ts: datetime,
        signals: List[Signal],
        signal_type: SignalType,
        reason: str,
        meta: dict,
    ) -> Trade:
        signals.append(
            Signal(
                symbol=symbol,
                timestamp=ts,
                signal_type=signal_type,
                side=side,
                price=price,
                reason=reason,
                metadata=meta,
            )
        )
        return Trade(
            symbol=symbol,
            side=side,
            quantity=quantity,
            entry_price=price,
            entry_time=ts,
        )

    def _flatten(
        self,
        trade: Trade,
        candle: Candle,
        signals: List[Signal],
        reason: str,
    ) -> None:
        signal_type = (
            SignalType.EXIT_LONG
            if trade.side == Side.LONG
            else SignalType.EXIT_SHORT
        )
        if reason.startswith("end_of_session"):
            signal_type = SignalType.FLATTEN
        trade.close(candle.close, candle.timestamp)
        signals.append(
            Signal(
                symbol=trade.symbol,
                timestamp=candle.timestamp,
                signal_type=signal_type,
                side=Side.FLAT,
                price=candle.close,
                reason=reason,
            )
        )

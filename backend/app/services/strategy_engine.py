"""Strategy engine — loads candles (optional) and evaluates strategies."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.domain.candles import Candle
from app.domain.enums import SessionType
from app.domain.strategy_types import StrategyContext, StrategyResult
from app.ports.strategy import Strategy
from app.services.market_data_service import MarketDataService
from app.strategies.registry import StrategyRegistry, get_strategy_registry

logger = get_logger(__name__)


class StrategyEngine:
    """
    Orchestrates strategy evaluation.

    Does not import Schwab or TradeAdvocate modules.
    """

    def __init__(
        self,
        registry: StrategyRegistry | None = None,
        *,
        market_data: MarketDataService | None = None,
        session: Session | None = None,
    ) -> None:
        self._registry = registry or get_strategy_registry()
        if market_data is not None:
            self._market_data = market_data
        elif session is not None:
            self._market_data = MarketDataService(session)
        else:
            self._market_data = None

    def get_strategy(self, name: str) -> Strategy:
        return self._registry.get(name)

    def list_strategies(self) -> list[Strategy]:
        return self._registry.list()

    def evaluate(
        self,
        strategy_name: str,
        candles: list[Candle],
        context: StrategyContext,
    ) -> StrategyResult:
        strategy = self.get_strategy(strategy_name)
        logger.info(
            "Evaluating strategy=%s ticker=%s candles=%s",
            strategy.name,
            context.ticker,
            len(candles),
        )
        return strategy.evaluate(candles, context)

    def evaluate_symbol(
        self,
        *,
        strategy_name: str,
        symbol: str,
        timeframe: str,
        start: date | datetime,
        end: date | datetime,
        parameters: dict[str, Any] | None = None,
        market_type: str | None = None,
        timezone: str = "America/New_York",
        extra_timeframes: tuple[str, ...] | list[str] | None = None,
        context_start: date | datetime | None = None,
        context_end: date | datetime | None = None,
    ) -> StrategyResult:
        if self._market_data is None:
            raise RuntimeError("StrategyEngine requires MarketDataService for evaluate_symbol")

        start_dt = _as_datetime_start(start)
        end_dt = _as_datetime_end(end)
        instrument = self._market_data.get_instrument(symbol, market_type=market_type)
        candles = self._market_data.get_candles_by_range(
            instrument.id, timeframe, start_dt, end_dt
        )
        extras: dict[str, list[Candle]] = {}
        for tf in extra_timeframes or ():
            if tf == timeframe:
                continue
            extras[tf] = self._market_data.get_candles_by_range(
                instrument.id, tf, start_dt, end_dt
            )
        missing = [tf for tf, rows in extras.items() if not rows]
        if candles and missing:
            hint = (
                " Yahoo 1m only keeps ~7 days — Sync market data (include 1m) then re-run."
                if "1m" in missing
                else ""
            )
            raise ValueError(
                f"{strategy_name} needs {', '.join(missing)} candles in the DB "
                f"(have {len(candles)}×{timeframe}, 0×{', '.join(missing)})."
                f"{hint}"
            )
        context = StrategyContext(
            ticker=symbol,
            timeframe=timeframe,
            start=context_start if context_start is not None else start,
            end=context_end if context_end is not None else end,
            parameters=parameters or {},
            timezone=timezone,
            session=SessionType.RTH,
            extra_candles=extras,
        )
        return self.evaluate(strategy_name, candles, context)


def _as_datetime_start(value: date | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.combine(value, datetime.min.time())


def _as_datetime_end(value: date | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.combine(value, datetime.max.time().replace(microsecond=0))

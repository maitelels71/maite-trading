"""Strategy evaluation and synchronous backtest orchestration."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional, Sequence

from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.domain.candles import Candle
from app.domain.enums import BacktestStatus
from app.domain.strategy_types import StrategyParams, StrategyResult
from app.models.backtest_run import BacktestRun
from app.models.instrument import Instrument
from app.models.signal import SignalRow
from app.models.trade import TradeRow
from app.services.market_data_service import MarketDataService
from app.strategies.registry import StrategyRegistry, get_strategy_registry

logger = get_logger(__name__)


class StrategyEngine:
    def __init__(
        self,
        session: Session,
        market_data: Optional[MarketDataService] = None,
        registry: Optional[StrategyRegistry] = None,
    ) -> None:
        self.session = session
        self.market_data = market_data or MarketDataService(session)
        self.registry = registry or get_strategy_registry()

    def evaluate(
        self,
        strategy_id: str,
        symbol: str,
        candles: Sequence[Candle],
        params: Optional[StrategyParams] = None,
    ) -> StrategyResult:
        strategy = self.registry.get(strategy_id)
        return strategy.evaluate(symbol, candles, params=params)

    def backtest(
        self,
        strategy_id: str,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
        params: Optional[StrategyParams] = None,
        *,
        sync_first: bool = True,
    ) -> dict[str, Any]:
        instrument = self.market_data.get_instrument(symbol)
        params = (params or StrategyParams()).validated()

        run = BacktestRun(
            strategy_key=strategy_id,
            instrument_id=instrument.id,
            symbol=instrument.symbol,
            timeframe=timeframe,
            status=BacktestStatus.RUNNING.value,
            params_json={
                "opening_range_minutes": params.opening_range_minutes,
                "quantity": str(params.quantity),
                "allow_long": params.allow_long,
                "allow_short": params.allow_short,
                "flatten_at_session_end": params.flatten_at_session_end,
                **params.extra,
            },
            start_time=start,
            end_time=end,
        )
        self.session.add(run)
        self.session.flush()

        try:
            if sync_first:
                self.market_data.sync(symbol, timeframe, start, end)

            candles = self.market_data.get_cached_candles(
                instrument.id,
                timeframe,
                start,
                end,
                symbol=instrument.symbol,
            )
            result = self.evaluate(strategy_id, instrument.symbol, candles, params=params)
            self._persist_result(run, instrument, result)

            run.status = BacktestStatus.COMPLETED.value
            run.total_trades = result.closed_trade_count
            run.total_pnl = result.total_pnl
            run.summary_json = {
                "signals": len(result.signals),
                "trades": len(result.trades),
                "total_pnl": str(result.total_pnl),
                "metadata": result.metadata,
            }
            run.completed_at = datetime.now(timezone.utc)
            self.session.flush()

            return {
                "backtest_run_id": run.id,
                "status": run.status,
                "symbol": instrument.symbol,
                "strategy_id": strategy_id,
                "total_trades": run.total_trades,
                "total_pnl": str(run.total_pnl),
                "signals": [
                    {
                        "timestamp": s.timestamp.isoformat(),
                        "signal_type": s.signal_type.value,
                        "side": s.side.value,
                        "price": str(s.price),
                        "reason": s.reason,
                    }
                    for s in result.signals
                ],
                "trades": [
                    {
                        "side": t.side.value,
                        "quantity": str(t.quantity),
                        "entry_price": str(t.entry_price),
                        "entry_time": t.entry_time.isoformat(),
                        "exit_price": str(t.exit_price) if t.exit_price is not None else None,
                        "exit_time": t.exit_time.isoformat() if t.exit_time else None,
                        "pnl": str(t.pnl) if t.pnl is not None else None,
                        "status": t.status.value,
                    }
                    for t in result.trades
                ],
                "summary": run.summary_json,
            }
        except Exception as exc:
            logger.exception("backtest failed")
            run.status = BacktestStatus.FAILED.value
            run.error_message = str(exc)
            run.completed_at = datetime.now(timezone.utc)
            self.session.flush()
            raise

    def _persist_result(
        self,
        run: BacktestRun,
        instrument: Instrument,
        result: StrategyResult,
    ) -> None:
        for signal in result.signals:
            self.session.add(
                SignalRow(
                    backtest_run_id=run.id,
                    instrument_id=instrument.id,
                    symbol=signal.symbol,
                    timestamp=signal.timestamp,
                    signal_type=signal.signal_type.value,
                    side=signal.side.value,
                    price=signal.price,
                    reason=signal.reason,
                    metadata_json=signal.metadata,
                )
            )
        for trade in result.trades:
            self.session.add(
                TradeRow(
                    backtest_run_id=run.id,
                    instrument_id=instrument.id,
                    symbol=trade.symbol,
                    side=trade.side.value,
                    quantity=trade.quantity,
                    entry_price=trade.entry_price,
                    entry_time=trade.entry_time,
                    exit_price=trade.exit_price,
                    exit_time=trade.exit_time,
                    status=trade.status.value,
                    pnl=trade.pnl,
                    external_id=trade.id,
                )
            )
        self.session.flush()

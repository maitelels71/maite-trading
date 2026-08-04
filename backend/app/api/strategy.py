"""Strategy listing and evaluation endpoints."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.storage import get_dynamo_store, using_dynamo
from app.database.session import get_db
from app.domain.enums import Side
from app.domain.strategy_types import StrategyResult
from app.models import BacktestRun, Instrument, Strategy as StrategyModel
from app.models import SignalRow, Trade as TradeModel
from app.schemas.common import SignalOut, StrategyOut, TradeOut
from app.schemas.strategy_api import (
    MetricsOut,
    StrategyBacktestRequest,
    StrategyBacktestResponse,
    StrategyEvaluateRequest,
    StrategyEvaluateResponse,
    StrategyListResponse,
)
from app.services.market_data_service import MarketDataService
from app.services.strategy_engine import StrategyEngine
from app.strategies.registry import get_strategy_registry

router = APIRouter(prefix="/strategy", tags=["strategy"])
strategies_router = APIRouter(prefix="/strategies", tags=["strategies"])


@strategies_router.get("", response_model=StrategyListResponse)
def list_strategies() -> StrategyListResponse:
    registry = get_strategy_registry()
    return StrategyListResponse(
        items=[
            StrategyOut(
                name=s.name,
                description=s.description,
                default_parameters=s.default_parameters,
            )
            for s in registry.list()
        ]
    )


@router.post("/evaluate", response_model=StrategyEvaluateResponse)
def evaluate_strategy(
    body: StrategyEvaluateRequest,
    db: Session = Depends(get_db),
) -> StrategyEvaluateResponse:
    try:
        if using_dynamo():
            result = _evaluate_dynamo(
                strategy_name=body.strategy,
                ticker=body.ticker,
                timeframe=body.timeframe,
                start=body.date,
                end=body.date,
                parameters=body.parameters,
                market_type=body.market_type,
            )
        else:
            engine = StrategyEngine(session=db)
            result = engine.evaluate_symbol(
                strategy_name=body.strategy,
                symbol=body.ticker,
                timeframe=body.timeframe,
                start=body.date,
                end=body.date,
                parameters=body.parameters,
                market_type=body.market_type,
            )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — map provider/instrument errors
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    metrics = _metrics_out(result)
    return StrategyEvaluateResponse(
        ticker=body.ticker,
        strategy=body.strategy,
        timeframe=body.timeframe,
        date=body.date,
        metrics=metrics,
        signals=_signals_out(result),
        trades=_trades_out(result),
    )


@router.post("/backtest", response_model=StrategyBacktestResponse)
def backtest_strategy(
    body: StrategyBacktestRequest,
    db: Session = Depends(get_db),
) -> StrategyBacktestResponse:
    try:
        if using_dynamo():
            store = get_dynamo_store()
            instrument = store.get_instrument(body.ticker, market_type=body.market_type)
            result = _evaluate_dynamo(
                strategy_name=body.strategy,
                ticker=body.ticker,
                timeframe=body.timeframe,
                start=body.start_date,
                end=body.end_date,
                parameters=body.parameters,
                market_type=body.market_type,
            )
            run_id = None
            if body.persist:
                run_id = store.save_backtest_run(
                    strategy=body.strategy,
                    symbol=instrument["symbol"],
                    market_type=instrument["market_type"],
                    timeframe=body.timeframe,
                    start_date=body.start_date,
                    end_date=body.end_date,
                    parameters=body.parameters,
                    metrics={
                        "total_trades": result.metrics.total_trades,
                        "winning_trades": result.metrics.winning_trades,
                        "losing_trades": result.metrics.losing_trades,
                        "win_rate": result.metrics.win_rate,
                        "profit_loss": str(result.metrics.profit_loss),
                        "max_drawdown": str(result.metrics.max_drawdown),
                    },
                    trades=[
                        {
                            "side": t.side.value if isinstance(t.side, Side) else str(t.side),
                            "signal": t.signal,
                            "entry_time": t.entry_time.isoformat(),
                            "entry_price": str(t.entry_price),
                            "exit_time": t.exit_time.isoformat() if t.exit_time else None,
                            "exit_price": str(t.exit_price) if t.exit_price is not None else None,
                            "profit_loss": str(t.profit_loss) if t.profit_loss is not None else None,
                            "notes": t.notes,
                        }
                        for t in result.trades
                    ],
                )
        else:
            engine = StrategyEngine(session=db)
            mds = MarketDataService(db)
            instrument = mds.get_instrument(body.ticker, market_type=body.market_type)
            result = engine.evaluate_symbol(
                strategy_name=body.strategy,
                symbol=body.ticker,
                timeframe=body.timeframe,
                start=body.start_date,
                end=body.end_date,
                parameters=body.parameters,
                market_type=body.market_type,
            )
            run_id = None
            if body.persist:
                run_id = _persist_run(db, body, instrument, result)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    metrics = result.metrics
    return StrategyBacktestResponse(
        run_id=run_id,
        ticker=body.ticker,
        strategy=body.strategy,
        timeframe=body.timeframe,
        start_date=body.start_date,
        end_date=body.end_date,
        total_trades=metrics.total_trades,
        winning_trades=metrics.winning_trades,
        losing_trades=metrics.losing_trades,
        win_rate=metrics.win_rate,
        profit_loss=metrics.profit_loss,
        max_drawdown=metrics.max_drawdown,
        trades=_trades_out(result),
        signals=_signals_out(result),
    )


def _evaluate_dynamo(
    *,
    strategy_name: str,
    ticker: str,
    timeframe: str,
    start: date | datetime,
    end: date | datetime,
    parameters: dict,
    market_type: str | None,
) -> StrategyResult:
    from datetime import datetime as dt

    from app.domain.enums import SessionType
    from app.domain.strategy_types import StrategyContext

    store = get_dynamo_store()
    store.seed_defaults()
    instrument = store.get_instrument(ticker, market_type=market_type)
    start_dt = start if isinstance(start, dt) else dt.combine(start, dt.min.time())
    end_dt = end if isinstance(end, dt) else dt.combine(end, dt.max.time().replace(microsecond=0))
    candles = store.get_candles_by_range(
        instrument["symbol"],
        instrument["market_type"],
        timeframe,
        start_dt,
        end_dt,
    )
    context = StrategyContext(
        ticker=ticker,
        timeframe=timeframe,
        start=start,
        end=end,
        parameters=parameters or {},
        timezone="America/New_York",
        session=SessionType.RTH,
    )
    return StrategyEngine().evaluate(strategy_name, candles, context)


def _metrics_out(result: StrategyResult) -> MetricsOut:
    m = result.metrics
    return MetricsOut(
        total_trades=m.total_trades,
        winning_trades=m.winning_trades,
        losing_trades=m.losing_trades,
        win_rate=m.win_rate,
        profit_loss=m.profit_loss,
        max_drawdown=m.max_drawdown,
    )


def _signals_out(result: StrategyResult) -> list[SignalOut]:
    return [
        SignalOut(
            timestamp=s.timestamp,
            side=s.side,
            price=s.price,
            reason=s.reason,
            ticker=s.ticker,
        )
        for s in result.signals
    ]


def _trades_out(result: StrategyResult) -> list[TradeOut]:
    return [
        TradeOut(
            side=t.side,
            entry_time=t.entry_time,
            entry_price=t.entry_price,
            signal=t.signal,
            exit_time=t.exit_time,
            exit_price=t.exit_price,
            profit_loss=t.profit_loss,
            notes=t.notes,
        )
        for t in result.trades
    ]


def _persist_run(
    db: Session,
    body: StrategyBacktestRequest,
    instrument: Instrument,
    result: StrategyResult,
):
    strategy_row = db.scalar(
        select(StrategyModel).where(StrategyModel.name == body.strategy)
    )
    if strategy_row is None:
        s = get_strategy_registry().get(body.strategy)
        strategy_row = StrategyModel(
            name=s.name,
            description=s.description,
            version="1.0.0",
            parameters=s.default_parameters,
            status="active",
        )
        db.add(strategy_row)
        db.flush()

    run = BacktestRun(
        id=uuid4(),
        strategy_id=strategy_row.id,
        instrument_id=instrument.id,
        timeframe=body.timeframe,
        start_date=body.start_date,
        end_date=body.end_date,
        parameters=body.parameters,
        status="completed",
        metrics={
            "total_trades": result.metrics.total_trades,
            "winning_trades": result.metrics.winning_trades,
            "losing_trades": result.metrics.losing_trades,
            "win_rate": result.metrics.win_rate,
            "profit_loss": str(result.metrics.profit_loss),
            "max_drawdown": str(result.metrics.max_drawdown),
        },
    )
    db.add(run)
    db.flush()

    for t in result.trades:
        db.add(
            TradeModel(
                backtest_run_id=run.id,
                side=t.side.value if isinstance(t.side, Side) else str(t.side),
                signal=t.signal,
                entry_time=t.entry_time,
                entry_price=t.entry_price,
                exit_time=t.exit_time,
                exit_price=t.exit_price,
                profit_loss=t.profit_loss,
                notes=t.notes,
            )
        )
    for s in result.signals:
        db.add(
            SignalRow(
                backtest_run_id=run.id,
                instrument_id=instrument.id,
                strategy_id=strategy_row.id,
                timestamp=s.timestamp,
                side=s.side.value if isinstance(s.side, Side) else str(s.side),
                reason=s.reason,
                price=s.price,
            )
        )
    db.commit()
    return run.id

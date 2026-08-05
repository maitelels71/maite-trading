"""Strategy listing and evaluation endpoints."""

from __future__ import annotations

from datetime import UTC, date, datetime
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
    StrategyScanHit,
    StrategyScanRequest,
    StrategyScanResponse,
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


@router.post("/scan", response_model=StrategyScanResponse)
def scan_strategies(
    body: StrategyScanRequest,
    db: Session = Depends(get_db),
) -> StrategyScanResponse:
    """Evaluate all (or filtered) instruments against registered strategies for a session day.

    Designed for dashboard Scanner polling. New strategies auto-appear via the registry.
    """
    return execute_scan(body, db=db)


def execute_scan(
    body: StrategyScanRequest,
    *,
    db: Session | None = None,
) -> StrategyScanResponse:
    from datetime import datetime as dt
    from zoneinfo import ZoneInfo

    registry = get_strategy_registry()
    strategy_names = body.strategies or [s.name for s in registry.list()]
    for name in strategy_names:
        try:
            registry.get(name)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    tz = ZoneInfo("America/New_York")
    scan_day = body.session_date or dt.now(tz).date()
    instruments = _list_scan_instruments(
        db,
        data_provider=body.data_provider,
        symbols=body.symbols,
    )

    hits: list[StrategyScanHit] = []
    for inst in instruments:
        for strategy_name in strategy_names:
            hits.append(
                _scan_one(
                    db=db,
                    symbol=inst["symbol"],
                    name=inst["name"],
                    market_type=inst["market_type"],
                    data_provider=inst["data_provider"],
                    strategy_name=strategy_name,
                    timeframe=body.timeframe,
                    scan_day=scan_day,
                )
            )

    if body.matches_only:
        hits = [h for h in hits if h.matched]

    match_count = sum(1 for h in hits if h.matched)
    return StrategyScanResponse(
        scanned_at=dt.now(UTC),
        session_date=scan_day,
        timeframe=body.timeframe,
        strategies=strategy_names,
        hits=hits,
        match_count=match_count,
        total_checked=len(instruments) * len(strategy_names),
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


def _list_scan_instruments(
    db: Session,
    *,
    data_provider: str | None,
    symbols: list[str] | None,
) -> list[dict[str, str]]:
    if using_dynamo():
        store = get_dynamo_store()
        store.seed_defaults()
        rows = store.list_instruments()
        items = [
            {
                "symbol": r["symbol"],
                "name": str(r.get("name") or r["symbol"]),
                "market_type": r["market_type"],
                "data_provider": r["data_provider"],
            }
            for r in rows
            if r.get("active", True)
        ]
    else:
        q = select(Instrument).where(Instrument.active.is_(True)).order_by(Instrument.symbol)
        rows = db.scalars(q).all()
        items = [
            {
                "symbol": r.symbol,
                "name": r.name,
                "market_type": r.market_type,
                "data_provider": r.data_provider,
            }
            for r in rows
        ]

    if data_provider:
        items = [i for i in items if i["data_provider"] == data_provider]
    if symbols:
        wanted = {s.upper() for s in symbols}
        items = [i for i in items if i["symbol"].upper() in wanted]
    return items


def _scan_one(
    *,
    db: Session,
    symbol: str,
    name: str,
    market_type: str,
    data_provider: str,
    strategy_name: str,
    timeframe: str,
    scan_day: date,
) -> StrategyScanHit:
    try:
        candle_count = _session_candle_count(
            db,
            symbol=symbol,
            market_type=market_type,
            timeframe=timeframe,
            scan_day=scan_day,
        )
        if candle_count == 0:
            return StrategyScanHit(
                symbol=symbol,
                name=name,
                market_type=market_type,
                data_provider=data_provider,
                strategy=strategy_name,
                status="no_data",
                matched=False,
                detail="No candles for this session — sync market data when broker auth is ready.",
            )

        if using_dynamo():
            result = _evaluate_dynamo(
                strategy_name=strategy_name,
                ticker=symbol,
                timeframe=timeframe,
                start=scan_day,
                end=scan_day,
                parameters={},
                market_type=market_type,
            )
        else:
            engine = StrategyEngine(session=db)
            result = engine.evaluate_symbol(
                strategy_name=strategy_name,
                symbol=symbol,
                timeframe=timeframe,
                start=scan_day,
                end=scan_day,
                parameters={},
                market_type=market_type,
            )
    except Exception as exc:  # noqa: BLE001
        return StrategyScanHit(
            symbol=symbol,
            name=name,
            market_type=market_type,
            data_provider=data_provider,
            strategy=strategy_name,
            status="error",
            matched=False,
            detail=str(exc),
        )

    status, matched, detail, last_signal, open_trade = _classify_scan_result(result)
    return StrategyScanHit(
        symbol=symbol,
        name=name,
        market_type=market_type,
        data_provider=data_provider,
        strategy=strategy_name,
        status=status,
        matched=matched,
        detail=detail,
        last_signal=last_signal,
        open_trade=open_trade,
        metrics=_metrics_out(result),
    )


def _session_candle_count(
    db: Session,
    *,
    symbol: str,
    market_type: str,
    timeframe: str,
    scan_day: date,
) -> int:
    start_dt = datetime.combine(scan_day, datetime.min.time())
    end_dt = datetime.combine(scan_day, datetime.max.time().replace(microsecond=0))
    if using_dynamo():
        store = get_dynamo_store()
        store.seed_defaults()
        instrument = store.get_instrument(symbol, market_type=market_type)
        candles = store.get_candles_by_range(
            instrument["symbol"],
            instrument["market_type"],
            timeframe,
            start_dt,
            end_dt,
        )
        return len(candles)

    mds = MarketDataService(db)
    instrument = mds.get_instrument(symbol, market_type=market_type)
    candles = mds.get_candles_by_range(
        instrument.id,
        timeframe,
        start_dt,
        end_dt,
    )
    return len(candles)


def _classify_scan_result(
    result: StrategyResult,
) -> tuple[str, bool, str, SignalOut | None, TradeOut | None]:
    """Map strategy output → scanner status. Extensible as new strategies appear."""
    open_trades = [t for t in result.trades if t.exit_time is None]
    last_signal = _signals_out(result)[-1] if result.signals else None
    open_trade = (
        TradeOut(
            side=open_trades[0].side,
            entry_time=open_trades[0].entry_time,
            entry_price=open_trades[0].entry_price,
            signal=open_trades[0].signal,
            exit_time=open_trades[0].exit_time,
            exit_price=open_trades[0].exit_price,
            profit_loss=open_trades[0].profit_loss,
            notes=open_trades[0].notes,
        )
        if open_trades
        else None
    )

    if open_trades:
        side = open_trades[0].side
        side_val = side.value if isinstance(side, Side) else str(side)
        return (
            f"active_{side_val}",
            True,
            f"Open {side_val} position from {open_trades[0].signal}",
            last_signal,
            open_trade,
        )

    if result.signals:
        side = result.signals[-1].side
        side_val = side.value if isinstance(side, Side) else str(side)
        return (
            f"signal_{side_val}",
            True,
            result.signals[-1].reason or f"Latest signal: {side_val}",
            last_signal,
            None,
        )

    if result.trades:
        return (
            "flat_after_trades",
            True,
            f"{len(result.trades)} trade(s) completed this session",
            last_signal,
            None,
        )

    return (
        "watching",
        False,
        "Watching — opening range formed or waiting for breakout",
        last_signal,
        None,
    )


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

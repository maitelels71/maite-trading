"""Strategy listing and evaluation endpoints."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo

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

_NY = ZoneInfo("America/New_York")
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

    registry = get_strategy_registry()
    strategy_names = body.strategies or [s.name for s in registry.list()]
    for name in strategy_names:
        try:
            registry.get(name)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    from app.domain.session_calendar import resolve_operative_session_date

    # Live desk: omit session_date → last/current NY cash session (not calendar
    # "today" before the open, which otherwise yields wall-to-wall no_data).
    scan_day = body.session_date or resolve_operative_session_date()
    instruments = _list_scan_instruments(
        db,
        data_provider=body.data_provider,
        symbols=body.symbols,
    )

    if using_dynamo():
        get_dynamo_store().seed_defaults()

    candle_cache: dict[tuple[str, str, str, str, str], list] = {}
    hits: list[StrategyScanHit] = []
    matched_symbols: set[str] = set()
    checked = 0
    # HTTP API integration timeout is ~29s — stop early so the client
    # gets a 200 with partial hits instead of a 503.
    deadline = dt.now(UTC) + timedelta(seconds=20)

    # Prefer finding matches quickly: iterate symbols outer, strategies inner,
    # and stop early when top_n unique symbols are filled.
    for inst in instruments:
        if body.top_n is not None and len(matched_symbols) >= body.top_n:
            break
        if dt.now(UTC) >= deadline:
            break
        for strategy_name in strategy_names:
            if body.top_n is not None and len(matched_symbols) >= body.top_n:
                break
            if dt.now(UTC) >= deadline:
                break
            hit = _scan_one(
                db=db,
                symbol=inst["symbol"],
                name=inst["name"],
                market_type=inst["market_type"],
                data_provider=inst["data_provider"],
                strategy_name=strategy_name,
                timeframe=body.timeframe,
                scan_day=scan_day,
                candle_cache=candle_cache,
            )
            checked += 1
            if body.matches_only and not hit.matched:
                continue
            hits.append(hit)
            if hit.matched:
                matched_symbols.add(hit.symbol)

    if body.top_n is not None:
        matched = [h for h in hits if h.matched]
        picked: list[StrategyScanHit] = []
        seen: set[str] = set()
        for h in matched:
            if h.symbol in seen:
                continue
            seen.add(h.symbol)
            picked.append(h)
            if len(picked) >= body.top_n:
                break
        hits = picked

    match_count = sum(1 for h in hits if h.matched)
    return StrategyScanResponse(
        scanned_at=dt.now(UTC),
        session_date=scan_day,
        timeframe=body.timeframe,
        strategies=strategy_names,
        hits=hits,
        match_count=match_count,
        total_checked=checked,
    )


@router.post("/evaluate", response_model=StrategyEvaluateResponse)
def evaluate_strategy(
    body: StrategyEvaluateRequest,
    db: Session = Depends(get_db),
) -> StrategyEvaluateResponse:
    try:
        strategy = get_strategy_registry().get(body.strategy)
        lookback = int(getattr(strategy, "scan_lookback_days", 0) or 0)
        extra_tfs = tuple(getattr(strategy, "scan_extra_timeframes", ()) or ())
        candle_start = body.date - timedelta(days=lookback)
        if using_dynamo():
            result = _evaluate_dynamo(
                strategy_name=body.strategy,
                ticker=body.ticker,
                timeframe=body.timeframe,
                start=body.date,
                end=body.date,
                parameters=body.parameters,
                market_type=body.market_type,
                extra_timeframes=extra_tfs,
                candle_start=candle_start,
                fetch_missing=True,
                require_extras=True,
            )
        else:
            engine = StrategyEngine(session=db)
            result = engine.evaluate_symbol(
                strategy_name=body.strategy,
                symbol=body.ticker,
                timeframe=body.timeframe,
                start=candle_start,
                end=body.date,
                parameters=body.parameters,
                market_type=body.market_type,
                extra_timeframes=extra_tfs,
                context_start=body.date,
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
            strategy = get_strategy_registry().get(body.strategy)
            lookback = int(getattr(strategy, "scan_lookback_days", 0) or 0)
            extra_tfs = tuple(getattr(strategy, "scan_extra_timeframes", ()) or ())
            candle_start = body.start_date - timedelta(days=lookback)
            result = _evaluate_dynamo(
                strategy_name=body.strategy,
                ticker=body.ticker,
                timeframe=body.timeframe,
                start=body.start_date,
                end=body.end_date,
                parameters=body.parameters,
                market_type=body.market_type,
                extra_timeframes=extra_tfs,
                candle_start=candle_start,
                fetch_missing=True,
                require_extras=True,
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
                        "win_rate": str(result.metrics.win_rate),
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
            strategy = get_strategy_registry().get(body.strategy)
            lookback = int(getattr(strategy, "scan_lookback_days", 0) or 0)
            extra_tfs = tuple(getattr(strategy, "scan_extra_timeframes", ()) or ())
            candle_start = body.start_date - timedelta(days=lookback)
            result = engine.evaluate_symbol(
                strategy_name=body.strategy,
                symbol=body.ticker,
                timeframe=body.timeframe,
                start=candle_start,
                end=body.end_date,
                parameters=body.parameters,
                market_type=body.market_type,
                extra_timeframes=extra_tfs,
                context_start=body.start_date,
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


# Live desk scan: extras (especially 1m) must stay small or API Gateway 503s.
_SCAN_EXTRA_LOOKBACK: dict[str, int] = {"1m": 2, "5m": 3, "15m": 5}


def _evaluate_dynamo(
    *,
    strategy_name: str,
    ticker: str,
    timeframe: str,
    start: date | datetime,
    end: date | datetime,
    parameters: dict,
    market_type: str | None,
    extra_timeframes: tuple[str, ...] | list[str] | None = None,
    candle_cache: dict[tuple[str, str, str, str, str], list] | None = None,
    candle_start: date | datetime | None = None,
    fetch_missing: bool = False,
    require_extras: bool = False,
    extra_lookback_days: dict[str, int] | None = None,
) -> StrategyResult:
    from datetime import datetime as dt

    from app.domain.candles import Candle
    from app.domain.enums import DataProviderName, SessionType
    from app.domain.strategy_types import StrategyContext
    from app.providers.factory import get_provider_factory

    store = get_dynamo_store()
    instrument = store.get_instrument(ticker, market_type=market_type)
    load_start = candle_start if candle_start is not None else start
    start_dt = (
        load_start if isinstance(load_start, dt) else dt.combine(load_start, dt.min.time())
    )
    end_dt = end if isinstance(end, dt) else dt.combine(end, dt.max.time().replace(microsecond=0))

    def _range_start(tf: str) -> dt:
        cap = (extra_lookback_days or {}).get(tf)
        if cap is None:
            return start_dt
        capped = end_dt - timedelta(days=cap)
        return capped if capped > start_dt else start_dt

    def _cache_key(tf: str, tf_start: dt) -> tuple[str, str, str, str, str]:
        return (
            instrument["symbol"],
            instrument["market_type"],
            tf,
            tf_start.isoformat(),
            end_dt.isoformat(),
        )

    def _load(tf: str, tf_start: dt) -> list[Candle]:
        key = _cache_key(tf, tf_start)
        if candle_cache is not None and key in candle_cache:
            return candle_cache[key]
        rows = store.get_candles_by_range(
            instrument["symbol"],
            instrument["market_type"],
            tf,
            tf_start,
            end_dt,
        )
        if candle_cache is not None:
            candle_cache[key] = rows
        return rows

    def _fetch_and_store(tf: str, tf_start: dt) -> list[Candle]:
        provider = get_provider_factory().get(
            DataProviderName(instrument["data_provider"])
        )
        fetched = provider.get_historical_candles(
            instrument["symbol"], tf, tf_start, end_dt
        )
        if fetched:
            store.save_candles(
                instrument["symbol"],
                instrument["market_type"],
                tf,
                fetched,
            )
        if candle_cache is not None:
            candle_cache[_cache_key(tf, tf_start)] = fetched
        return fetched

    def _load_or_fetch(tf: str, tf_start: dt) -> list[Candle]:
        rows = _load(tf, tf_start)
        if rows or not fetch_missing:
            return rows
        return _fetch_and_store(tf, tf_start)

    candles = _load_or_fetch(timeframe, start_dt)
    extras: dict[str, list[Candle]] = {}
    for tf in extra_timeframes or ():
        if tf == timeframe:
            continue
        extras[tf] = _load_or_fetch(tf, _range_start(tf))
    if require_extras:
        _require_extra_candles(
            strategy_name=strategy_name,
            primary_tf=timeframe,
            primary_count=len(candles),
            extras=extras,
        )
    context = StrategyContext(
        ticker=ticker,
        timeframe=timeframe,
        start=start,
        end=end,
        parameters=parameters or {},
        timezone="America/New_York",
        session=SessionType.RTH,
        extra_candles=extras,
    )
    return StrategyEngine().evaluate(strategy_name, candles, context)


def _require_extra_candles(
    *,
    strategy_name: str,
    primary_tf: str,
    primary_count: int,
    extras: dict[str, list],
) -> None:
    """Fail fast when multi-TF strategies have primary bars but empty extras."""
    if primary_count <= 0 or not extras:
        return
    missing = [tf for tf, rows in extras.items() if not rows]
    if not missing:
        return
    hint = ""
    if "1m" in missing:
        hint = " Yahoo 1m only keeps ~7 days — Sync market data (include 1m) then re-run."
    raise ValueError(
        f"{strategy_name} needs {', '.join(missing)} candles in the DB "
        f"(have {primary_count}×{primary_tf}, 0×{', '.join(missing)})."
        f"{hint}"
    )


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
    candle_cache: dict[tuple[str, str, str, str, str], list] | None = None,
) -> StrategyScanHit:
    strategy = get_strategy_registry().get(strategy_name)
    resolve_tf = getattr(strategy, "scan_timeframe", None) or timeframe
    lookback_days = int(getattr(strategy, "scan_lookback_days", 0) or 0)
    extra_tfs = tuple(getattr(strategy, "scan_extra_timeframes", ()) or ())
    eval_start = scan_day - timedelta(days=lookback_days)

    try:
        candle_count = _session_candle_count(
            db,
            symbol=symbol,
            market_type=market_type,
            timeframe=resolve_tf,
            scan_day=scan_day,
            candle_cache=candle_cache,
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
                detail=(
                    f"No {resolve_tf} candles for this session — sync market data "
                    "when broker auth is ready."
                ),
            )

        if using_dynamo():
            result = _evaluate_dynamo(
                strategy_name=strategy_name,
                ticker=symbol,
                timeframe=resolve_tf,
                start=scan_day,
                end=scan_day,
                parameters={},
                market_type=market_type,
                extra_timeframes=extra_tfs,
                candle_cache=candle_cache,
                candle_start=eval_start,
                fetch_missing=False,
                require_extras=False,
                extra_lookback_days=_SCAN_EXTRA_LOOKBACK,
            )
        else:
            engine = StrategyEngine(session=db)
            result = engine.evaluate_symbol(
                strategy_name=strategy_name,
                symbol=symbol,
                timeframe=resolve_tf,
                start=eval_start,
                end=scan_day,
                parameters={},
                market_type=market_type,
                extra_timeframes=extra_tfs,
                context_start=scan_day,
            )

        # Desk only: never keep a morning signal after price reversed through it
        from app.strategies.live_hold import drop_reversed_session_signals

        primary = _candles_for_scan_day(
            db,
            symbol=symbol,
            market_type=market_type,
            timeframe=resolve_tf,
            scan_day=scan_day,
            lookback_days=lookback_days,
            candle_cache=candle_cache,
        )
        result = drop_reversed_session_signals(
            result,
            primary,
            session_day=scan_day,
            timeframe=resolve_tf,
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


def _candles_for_scan_day(
    db: Session,
    *,
    symbol: str,
    market_type: str,
    timeframe: str,
    scan_day: date,
    lookback_days: int,
    candle_cache: dict[tuple[str, str, str, str, str], list] | None = None,
) -> list:
    """Primary TF candles used for evaluate + live-hold stale filter."""
    from datetime import datetime as dt

    load_start = scan_day - timedelta(days=lookback_days)
    start_dt = dt.combine(load_start, dt.min.time())
    end_dt = dt.combine(scan_day, dt.max.time().replace(microsecond=0))
    if using_dynamo():
        store = get_dynamo_store()
        instrument = store.get_instrument(symbol, market_type=market_type)
        key = (
            instrument["symbol"],
            instrument["market_type"],
            timeframe,
            start_dt.isoformat(),
            end_dt.isoformat(),
        )
        if candle_cache is not None and key in candle_cache:
            return candle_cache[key]
        rows = store.get_candles_by_range(
            instrument["symbol"],
            instrument["market_type"],
            timeframe,
            start_dt,
            end_dt,
        )
        if candle_cache is not None:
            candle_cache[key] = rows
        return rows

    mds = MarketDataService(db)
    instrument = mds.get_instrument(symbol, market_type=market_type)
    return mds.get_candles_by_range(instrument.id, timeframe, start_dt, end_dt)


def _session_candle_count(
    db: Session,
    *,
    symbol: str,
    market_type: str,
    timeframe: str,
    scan_day: date,
    candle_cache: dict[tuple[str, str, str, str, str], list] | None = None,
) -> int:
    start_dt = datetime.combine(scan_day, datetime.min.time())
    end_dt = datetime.combine(scan_day, datetime.max.time().replace(microsecond=0))
    if using_dynamo():
        store = get_dynamo_store()
        instrument = store.get_instrument(symbol, market_type=market_type)
        key = (
            instrument["symbol"],
            instrument["market_type"],
            timeframe,
            start_dt.isoformat(),
            end_dt.isoformat(),
        )
        if candle_cache is not None and key in candle_cache:
            return len(candle_cache[key])
        candles = store.get_candles_by_range(
            instrument["symbol"],
            instrument["market_type"],
            timeframe,
            start_dt,
            end_dt,
        )
        if candle_cache is not None:
            candle_cache[key] = candles
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
            setup=getattr(open_trades[0], "setup", None),
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

    # Closed trades from a prior NY calendar day are historical — not live entries.
    # (E01 flattens at last RTH bar; premarket scan of yesterday must not look "live".)
    today_ny = datetime.now(_NY).date()
    closed = [t for t in result.trades if t.exit_time is not None]
    if closed:
        last_exit = max(t.exit_time for t in closed if t.exit_time is not None)
        exit_day = _as_ny_date(last_exit)
        if exit_day is not None and exit_day < today_ny:
            reason = (
                result.signals[-1].reason
                if result.signals
                else f"{len(closed)} trade(s) completed"
            )
            return (
                "flat_after_trades",
                False,
                f"Completed {exit_day.isoformat()} · {reason}",
                last_signal,
                None,
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
        "Watching — setup conditions not met for this session",
        last_signal,
        None,
    )


def _as_ny_date(value: datetime | None) -> date | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=_NY).date()
    return value.astimezone(_NY).date()


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
            setup=getattr(t, "setup", None),
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

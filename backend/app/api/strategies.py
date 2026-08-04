"""Strategies listing + evaluate + backtest."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import strategy_engine, strategy_registry
from app.domain.candles import Candle
from app.domain.strategy_types import StrategyParams
from app.schemas.common import StrategyOut
from app.schemas.strategy_api import (
    BacktestRequest,
    BacktestResponse,
    EvaluateRequest,
    EvaluateResponse,
    SignalOut,
    TradeOut,
)
from app.services.strategy_engine import StrategyEngine
from app.strategies.registry import StrategyRegistry

router = APIRouter(tags=["strategies"])


@router.get("/strategies", response_model=list[StrategyOut])
def list_strategies(registry: StrategyRegistry = Depends(strategy_registry)) -> list[StrategyOut]:
    return [
        StrategyOut(id=s.id, name=s.name, description=s.description)
        for s in registry.list_strategies()
    ]


def _params(body_params) -> StrategyParams | None:
    if body_params is None:
        return None
    return StrategyParams(
        opening_range_minutes=body_params.opening_range_minutes,
        quantity=body_params.quantity,
        allow_long=body_params.allow_long,
        allow_short=body_params.allow_short,
        flatten_at_session_end=body_params.flatten_at_session_end,
    )


@router.post("/strategy/evaluate", response_model=EvaluateResponse)
def evaluate_strategy(
    body: EvaluateRequest,
    engine: StrategyEngine = Depends(strategy_engine),
) -> EvaluateResponse:
    candles = [
        Candle(
            symbol=body.symbol.upper(),
            timestamp=c.timestamp,
            open=c.open,
            high=c.high,
            low=c.low,
            close=c.close,
            volume=c.volume,
            timeframe=c.timeframe,
        )
        for c in body.candles
    ]
    try:
        result = engine.evaluate(body.strategy_id, body.symbol.upper(), candles, params=_params(body.params))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return EvaluateResponse(
        strategy_id=result.strategy_id,
        symbol=result.symbol,
        signals=[
            SignalOut(
                timestamp=s.timestamp,
                signal_type=s.signal_type.value,
                side=s.side.value,
                price=str(s.price),
                reason=s.reason,
            )
            for s in result.signals
        ],
        trades=[
            TradeOut(
                side=t.side.value,
                quantity=str(t.quantity),
                entry_price=str(t.entry_price),
                entry_time=t.entry_time,
                exit_price=str(t.exit_price) if t.exit_price is not None else None,
                exit_time=t.exit_time,
                pnl=str(t.pnl) if t.pnl is not None else None,
                status=t.status.value,
            )
            for t in result.trades
        ],
        total_pnl=str(result.total_pnl),
        metadata=result.metadata,
    )


@router.post("/strategy/backtest", response_model=BacktestResponse)
def backtest_strategy(
    body: BacktestRequest,
    engine: StrategyEngine = Depends(strategy_engine),
) -> BacktestResponse:
    try:
        payload = engine.backtest(
            body.strategy_id,
            body.symbol.upper(),
            body.timeframe,
            body.start,
            body.end,
            params=_params(body.params),
            sync_first=body.sync_first,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return BacktestResponse(
        backtest_run_id=payload["backtest_run_id"],
        status=payload["status"],
        symbol=payload["symbol"],
        strategy_id=payload["strategy_id"],
        total_trades=payload["total_trades"],
        total_pnl=payload["total_pnl"],
        signals=[SignalOut(**s) for s in payload["signals"]],
        trades=[TradeOut(**t) for t in payload["trades"]],
        summary=payload["summary"],
    )

"""Coinbase bot dashboard API — dry-run / live / history."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.core.desk_auth import require_desk_session
from app.providers.coinbase_trader import resolve_key_file
from app.providers.exceptions import ProviderError, ProviderNotConfiguredError
from app.services.coinbase_bot import run_rebalance
from app.services.coinbase_plan_settings import (
    PlanKnobs,
    load_knobs,
    save_knobs,
    settings_with_knobs,
)
from app.services.coinbase_run_log import append_run, compute_stats, list_runs

router = APIRouter(prefix="/coinbase", tags=["coinbase"])


class RunRequest(BaseModel):
    live: bool = False
    confirm_live: bool = False
    max_trade_usd: float | None = None
    min_trade_usd: float | None = None
    cash_pct: float | None = None
    rebalance_threshold_pct: float | None = None
    lookback_days: int | None = None


class PlanSettingsIn(BaseModel):
    max_trade_usd: float
    min_trade_usd: float
    cash_pct: float = Field(ge=0.0, le=0.50)
    rebalance_threshold_pct: float
    lookback_days: int


class StatusResponse(BaseModel):
    configured: bool
    trading_enabled: bool
    dry_run_default: bool
    quote: str
    assets: str
    max_trade_usd: float
    min_trade_usd: float
    cash_pct: float
    rebalance_threshold_pct: float
    lookback_days: int
    key_file_present: bool


def _configured() -> tuple[bool, bool]:
    key_file = (settings.coinbase_key_file or "").strip()
    present = False
    if key_file:
        present = resolve_key_file(key_file).is_file()
    has_env = bool(
        (settings.coinbase_api_key or "").strip()
        and (settings.coinbase_api_secret or "").strip()
    )
    return (present or has_env), present


def _knobs_from_run(body: RunRequest) -> PlanKnobs:
    current = load_knobs()
    payload = current.model_dump()
    for field in (
        "max_trade_usd",
        "min_trade_usd",
        "cash_pct",
        "rebalance_threshold_pct",
        "lookback_days",
    ):
        value = getattr(body, field)
        if value is not None:
            payload[field] = value
    return PlanKnobs.model_validate(payload)


def _status_payload() -> StatusResponse:
    configured, present = _configured()
    knobs = load_knobs()
    return StatusResponse(
        configured=configured,
        trading_enabled=settings.coinbase_trading_enabled,
        dry_run_default=settings.coinbase_dry_run,
        quote=settings.coinbase_quote,
        assets=settings.coinbase_assets,
        max_trade_usd=knobs.max_trade_usd,
        min_trade_usd=knobs.min_trade_usd,
        cash_pct=knobs.cash_pct,
        rebalance_threshold_pct=knobs.rebalance_threshold_pct,
        lookback_days=knobs.lookback_days,
        key_file_present=present,
    )


@router.get("/status", response_model=StatusResponse)
def coinbase_status(_: dict = Depends(require_desk_session)) -> StatusResponse:
    return _status_payload()


@router.put("/settings")
def coinbase_save_settings(
    body: PlanSettingsIn,
    _: dict = Depends(require_desk_session),
) -> dict:
    try:
        knobs = PlanKnobs.model_validate(body.model_dump())
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    save_knobs(knobs)
    return knobs.model_dump()


@router.get("/runs")
def coinbase_runs(_: dict = Depends(require_desk_session)) -> dict:
    return {"items": list_runs(limit=20)}


@router.get("/stats")
def coinbase_stats(_: dict = Depends(require_desk_session)) -> dict:
    return compute_stats()


@router.post("/run")
def coinbase_run(
    body: RunRequest,
    _: dict = Depends(require_desk_session),
) -> dict:
    try:
        knobs = _knobs_from_run(body)
        save_knobs(knobs)
        cfg = settings_with_knobs(knobs)
        result = run_rebalance(
            live=body.live,
            confirm_live=body.confirm_live,
            respect_dry_run=not body.live,
            config=cfg,
        )
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return append_run(result)

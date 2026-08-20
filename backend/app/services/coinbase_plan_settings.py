"""Persisted Coinbase plan knobs (dashboard overrides .env)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.config import Settings, settings

MAX_TRADE_CAP = 250.0
MIN_TRADE_FLOOR = 1.0


class PlanKnobs(BaseModel):
    max_trade_usd: float = Field(ge=MIN_TRADE_FLOOR, le=MAX_TRADE_CAP)
    min_trade_usd: float = Field(ge=MIN_TRADE_FLOOR, le=MAX_TRADE_CAP)
    cash_pct: float = Field(ge=0.0, le=0.50)
    rebalance_threshold_pct: float = Field(ge=1.0, le=25.0)
    lookback_days: int = Field(ge=7, le=90)

    @field_validator(
        "max_trade_usd",
        "min_trade_usd",
        "cash_pct",
        "rebalance_threshold_pct",
        mode="before",
    )
    @classmethod
    def _finite(cls, value: Any) -> Any:
        return float(value)

    @model_validator(mode="after")
    def _min_lte_max(self) -> PlanKnobs:
        if self.min_trade_usd > self.max_trade_usd:
            raise ValueError("min_trade_usd cannot exceed max_trade_usd")
        return self


def resolve_settings_path(config: Settings | None = None) -> Path:
    cfg = config or settings
    raw = (cfg.coinbase_settings_path or "").strip()
    path = Path(raw or ".secrets/coinbase_bot_settings.json")
    if path.is_absolute():
        return path
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / path


def knobs_from_env(config: Settings | None = None) -> PlanKnobs:
    cfg = config or settings
    return PlanKnobs(
        max_trade_usd=cfg.coinbase_max_trade_usd,
        min_trade_usd=cfg.coinbase_min_trade_usd,
        cash_pct=cfg.coinbase_cash_pct,
        rebalance_threshold_pct=cfg.coinbase_rebalance_threshold_pct,
        lookback_days=cfg.coinbase_lookback_days,
    )


def load_knobs(config: Settings | None = None) -> PlanKnobs:
    cfg = config or settings
    base = knobs_from_env(cfg)
    path = resolve_settings_path(cfg)
    if not path.is_file():
        return base
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return base
    if not isinstance(data, dict):
        return base
    merged = base.model_dump()
    for key in merged:
        if key in data:
            merged[key] = data[key]
    return PlanKnobs.model_validate(merged)


def save_knobs(knobs: PlanKnobs, config: Settings | None = None) -> PlanKnobs:
    path = resolve_settings_path(config)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(knobs.model_dump_json(indent=2), encoding="utf-8")
    return knobs


def settings_with_knobs(
    knobs: PlanKnobs,
    config: Settings | None = None,
) -> Settings:
    cfg = config or settings
    return cfg.model_copy(
        update={
            "coinbase_max_trade_usd": knobs.max_trade_usd,
            "coinbase_min_trade_usd": knobs.min_trade_usd,
            "coinbase_cash_pct": knobs.cash_pct,
            "coinbase_rebalance_threshold_pct": knobs.rebalance_threshold_pct,
            "coinbase_lookback_days": knobs.lookback_days,
        }
    )

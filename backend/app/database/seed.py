"""Database seed helpers for MVP instruments and strategies."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import STRATEGY_ORB
from app.domain.instruments import mvp_instrument_specs
from app.models.instrument import Instrument
from app.models.strategy import StrategyRow


def seed_instruments(session: Session) -> int:
    created = 0
    for spec in mvp_instrument_specs():
        existing = session.scalar(
            select(Instrument).where(
                Instrument.symbol == spec.symbol,
                Instrument.provider == spec.provider.value,
            )
        )
        if existing:
            continue
        session.add(
            Instrument(
                symbol=spec.symbol,
                name=spec.name,
                asset_class=spec.asset_class.value,
                provider=spec.provider.value,
                exchange=spec.exchange,
                currency=spec.currency,
                tick_size=spec.tick_size,
                contract_multiplier=spec.contract_multiplier,
                is_active=spec.is_active,
            )
        )
        created += 1
    session.flush()
    return created


def seed_strategies(session: Session) -> int:
    existing = session.scalar(select(StrategyRow).where(StrategyRow.strategy_key == STRATEGY_ORB))
    if existing:
        return 0
    session.add(
        StrategyRow(
            strategy_key=STRATEGY_ORB,
            name="Opening Range Breakout",
            description=(
                "Long above opening-range high, short below opening-range low. "
                "Reverses on opposite break; flats at RTH session end (America/New_York)."
            ),
            version="1.0.0",
            is_active=True,
        )
    )
    session.flush()
    return 1


def seed_all(session: Session) -> dict[str, int]:
    return {
        "instruments": seed_instruments(session),
        "strategies": seed_strategies(session),
    }

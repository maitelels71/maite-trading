"""Seed MVP instruments and Opening Range Breakout strategy row."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import MVP_INSTRUMENTS, STRATEGY_ORB
from app.domain.enums import MarketType
from app.models import Instrument, Strategy
from app.strategies.opening_range_breakout import OpeningRangeBreakoutStrategy


def seed_instruments(session: Session) -> int:
    """Insert MVP instruments if missing. Returns number inserted."""
    inserted = 0
    for row in MVP_INSTRUMENTS:
        exists = session.scalar(
            select(Instrument.id).where(
                Instrument.symbol == row["symbol"],
                Instrument.market_type == row["market_type"],
            )
        )
        if exists:
            continue
        session.add(
            Instrument(
                symbol=row["symbol"],
                name=row["name"],
                market_type=row["market_type"],
                data_provider=row["data_provider"],
                active=True,
            )
        )
        inserted += 1

    mvp_futures = {
        row["symbol"]
        for row in MVP_INSTRUMENTS
        if row["market_type"] == MarketType.FUTURE.value
    }
    for inst in session.scalars(
        select(Instrument).where(Instrument.market_type == MarketType.FUTURE.value)
    ):
        if inst.symbol not in mvp_futures and inst.active:
            inst.active = False
    return inserted


def seed_strategies(session: Session) -> int:
    """Insert ORB strategy definition if missing. Returns number inserted."""
    exists = session.scalar(select(Strategy.id).where(Strategy.name == STRATEGY_ORB))
    if exists:
        return 0
    orb = OpeningRangeBreakoutStrategy()
    session.add(
        Strategy(
            name=orb.name,
            description=orb.description,
            version="1.0.0",
            parameters=orb.default_parameters,
            status="active",
        )
    )
    return 1


def seed_all(session: Session) -> dict[str, int]:
    instruments = seed_instruments(session)
    strategies = seed_strategies(session)
    session.commit()
    return {"instruments": instruments, "strategies": strategies}

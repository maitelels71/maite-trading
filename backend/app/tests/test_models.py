"""ORM model / seed tests."""

from sqlalchemy import select

from app.database.seed import seed_all
from app.models.instrument import Instrument
from app.models.strategy import StrategyRow


def test_mvp_instruments_seeded(db_session):
    symbols = set(db_session.scalars(select(Instrument.symbol)).all())
    assert symbols == {"NQ", "ES", "GC", "6E", "AMZN", "TSLA", "SPY", "QQQ"}


def test_provider_routing_seed(db_session):
    futures = list(
        db_session.scalars(select(Instrument).where(Instrument.asset_class == "future"))
    )
    equities = list(
        db_session.scalars(
            select(Instrument).where(Instrument.asset_class.in_(["stock", "etf"]))
        )
    )
    assert all(i.provider == "tradeadvocate" for i in futures)
    assert all(i.provider == "schwab" for i in equities)
    assert len(futures) == 4
    assert len(equities) == 4


def test_strategy_seeded(db_session):
    row = db_session.scalar(
        select(StrategyRow).where(StrategyRow.strategy_key == "opening_range_breakout")
    )
    assert row is not None
    assert row.is_active is True


def test_seed_is_idempotent(db_session):
    counts = seed_all(db_session)
    assert counts["instruments"] == 0
    assert counts["strategies"] == 0

"""Model / schema tests using in-memory SQLite (no live Postgres required)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.constants import MVP_INSTRUMENTS
from app.database.base import Base
from app.database.seed import seed_all
from app.models import BacktestRun, Candle, Instrument, SignalRow, Strategy, Trade


@pytest.fixture()
def db_session() -> Session:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )

    @event.listens_for(engine, "connect")
    def _fk_pragma(dbapi_connection, _connection_record):  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def test_seed_mvp_instruments_and_orb(db_session: Session) -> None:
    first = seed_all(db_session)
    second = seed_all(db_session)
    assert first["instruments"] == len(MVP_INSTRUMENTS)
    assert first["strategies"] == 1
    assert second["instruments"] == 0
    assert second["strategies"] == 0

    spy = db_session.scalar(
        select(Instrument).where(
            Instrument.symbol == "SPY",
            Instrument.market_type == "etf",
        )
    )
    assert spy is not None
    assert spy.data_provider == "schwab"

    nq = db_session.scalar(
        select(Instrument).where(
            Instrument.symbol == "MNQ",
            Instrument.market_type == "future",
        )
    )
    assert nq is not None
    assert nq.data_provider == "tradeadvocate"

    mes = db_session.scalar(
        select(Instrument).where(
            Instrument.symbol == "MES",
            Instrument.market_type == "future",
        )
    )
    assert mes is not None
    assert mes.data_provider == "tradeadvocate"

    six_e = db_session.scalar(
        select(Instrument).where(
            Instrument.symbol == "6E",
            Instrument.market_type == "future",
        )
    )
    assert six_e is not None
    assert six_e.data_provider == "tradeadvocate"

    orb = db_session.scalar(
        select(Strategy).where(Strategy.name == "opening_range_breakout")
    )
    assert orb is not None
    assert orb.parameters["opening_range_minutes"] == 5


def test_seed_deactivates_dropped_futures(db_session: Session) -> None:
    db_session.add(
        Instrument(
            symbol="NQ",
            name="E-mini Nasdaq-100",
            market_type="future",
            data_provider="tradeadvocate",
            active=True,
        )
    )
    db_session.commit()
    seed_all(db_session)
    nq = db_session.scalar(
        select(Instrument).where(
            Instrument.symbol == "NQ",
            Instrument.market_type == "future",
        )
    )
    assert nq is not None
    assert nq.active is False


def test_unique_instrument_symbol_market(db_session: Session) -> None:
    db_session.add(
        Instrument(
            symbol="SPY",
            name="SPY",
            market_type="etf",
            data_provider="schwab",
        )
    )
    db_session.commit()
    db_session.add(
        Instrument(
            symbol="SPY",
            name="dup",
            market_type="etf",
            data_provider="schwab",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_unique_candle_constraint(db_session: Session) -> None:
    instrument = Instrument(
        symbol="ES",
        name="ES",
        market_type="future",
        data_provider="tradeadvocate",
    )
    db_session.add(instrument)
    db_session.flush()

    ts = datetime(2026, 1, 2, 14, 30, tzinfo=UTC)
    kwargs = dict(
        instrument_id=instrument.id,
        timestamp=ts,
        timeframe="5m",
        open=Decimal("5000"),
        high=Decimal("5001"),
        low=Decimal("4999"),
        close=Decimal("5000.5"),
        volume=Decimal("10"),
    )
    db_session.add(Candle(**kwargs))
    db_session.commit()
    db_session.add(Candle(**kwargs))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_backtest_run_trades_and_signals(db_session: Session) -> None:
    instrument = Instrument(
        symbol="AMZN",
        name="Amazon",
        market_type="stock",
        data_provider="schwab",
    )
    strategy = Strategy(
        name="opening_range_breakout",
        description="ORB",
        version="1.0.0",
        parameters={"opening_range_minutes": 5},
        status="active",
    )
    db_session.add_all([instrument, strategy])
    db_session.flush()

    run = BacktestRun(
        strategy_id=strategy.id,
        instrument_id=instrument.id,
        timeframe="5m",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 31),
        parameters={"opening_range_minutes": 5},
        status="completed",
        metrics={"total_trades": 1, "win_rate": 1.0},
    )
    db_session.add(run)
    db_session.flush()

    db_session.add(
        Trade(
            backtest_run_id=run.id,
            side="long",
            signal="breakout_high",
            entry_time=datetime(2026, 1, 2, 14, 35, tzinfo=UTC),
            entry_price=Decimal("200"),
            exit_time=datetime(2026, 1, 2, 20, 0, tzinfo=UTC),
            exit_price=Decimal("205"),
            profit_loss=Decimal("5"),
        )
    )
    db_session.add(
        SignalRow(
            backtest_run_id=run.id,
            instrument_id=instrument.id,
            strategy_id=strategy.id,
            timestamp=datetime(2026, 1, 2, 14, 35, tzinfo=UTC),
            side="long",
            reason="breakout above opening range high",
            price=Decimal("200"),
        )
    )
    db_session.commit()

    loaded = db_session.get(BacktestRun, run.id)
    assert loaded is not None
    assert len(loaded.trades) == 1
    assert len(loaded.signals) == 1
    assert loaded.trades[0].side == "long"

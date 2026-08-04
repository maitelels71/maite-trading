"""MarketDataService persistence tests."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.database.seed import seed_all
from app.domain.candles import Candle
from app.domain.enums import DataProviderName
from app.models import Candle as CandleModel
from app.providers.factory import ProviderFactory
from app.providers.mock import MockMarketDataProvider
from app.services.market_data_service import CandleValidationError, MarketDataService


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
    seed_all(session)
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _candle(ts: str, close: str = "100") -> Candle:
    return Candle(
        timestamp=datetime.fromisoformat(ts).replace(tzinfo=UTC),
        open=Decimal(close),
        high=Decimal(close) + Decimal("1"),
        low=Decimal(close) - Decimal("1"),
        close=Decimal(close),
        volume=Decimal("10"),
        ticker="SPY",
        timeframe="5m",
    )


def test_save_and_get_range(db_session: Session) -> None:
    service = MarketDataService(db_session)
    instrument = service.get_instrument("SPY", market_type="etf")
    candles = [
        _candle("2026-01-02T15:00:00"),
        _candle("2026-01-02T15:05:00", "101"),
    ]
    written = service.save_candles(instrument.id, "5m", candles)
    assert written == 2
    db_session.commit()

    loaded = service.get_candles_by_range(
        instrument.id,
        "5m",
        datetime(2026, 1, 2, 15, 0, tzinfo=UTC),
        datetime(2026, 1, 2, 15, 10, tzinfo=UTC),
    )
    assert len(loaded) == 2
    assert loaded[1].close == Decimal("101")


def test_duplicate_upsert_does_not_duplicate_rows(db_session: Session) -> None:
    service = MarketDataService(db_session)
    instrument = service.get_instrument("SPY", market_type="etf")
    c = [_candle("2026-01-02T15:00:00")]
    service.save_candles(instrument.id, "5m", c)
    service.save_candles(instrument.id, "5m", [_candle("2026-01-02T15:00:00", "105")])
    db_session.commit()

    count = len(
        list(
            db_session.scalars(
                select(CandleModel).where(CandleModel.instrument_id == instrument.id)
            )
        )
    )
    assert count == 1
    row = db_session.scalar(
        select(CandleModel).where(CandleModel.instrument_id == instrument.id)
    )
    assert row is not None
    assert Decimal(row.close) == Decimal("105")


def test_validate_rejects_bad_ohlc(db_session: Session) -> None:
    service = MarketDataService(db_session)
    instrument = service.get_instrument("SPY", market_type="etf")
    bad = Candle(
        timestamp=datetime(2026, 1, 2, 15, 0, tzinfo=UTC),
        open=Decimal("10"),
        high=Decimal("9"),
        low=Decimal("8"),
        close=Decimal("9"),
        volume=Decimal("1"),
        ticker="SPY",
        timeframe="5m",
    )
    with pytest.raises(CandleValidationError):
        service.save_candles(instrument.id, "5m", [bad])


def test_sync_uses_mock_provider_and_caches(db_session: Session) -> None:
    factory = ProviderFactory()
    mock = MockMarketDataProvider(
        {
            "NQ": [
                {
                    "timestamp": "2026-01-02T15:00:00+00:00",
                    "open": 5000,
                    "high": 5005,
                    "low": 4995,
                    "close": 5001,
                    "volume": 3,
                }
            ]
        },
        name=DataProviderName.TRADEADVOCATE,
    )
    factory._tradeadvocate = mock  # type: ignore[attr-defined]

    service = MarketDataService(db_session, provider_factory=factory)
    start = datetime(2026, 1, 2, 0, 0, tzinfo=UTC)
    end = datetime(2026, 1, 3, 0, 0, tzinfo=UTC)
    first = service.sync_historical_data(
        "NQ", "5m", start, end, market_type="future", force_refresh=True
    )
    assert len(first) == 1

    # Second call without force_refresh should hit DB cache (mock unused).
    factory._tradeadvocate = MockMarketDataProvider({}, name=DataProviderName.TRADEADVOCATE)  # type: ignore[attr-defined]
    cached = service.sync_historical_data(
        "NQ", "5m", start, end, market_type="future", force_refresh=False
    )
    assert len(cached) == 1
    assert cached[0].close == Decimal("5001")

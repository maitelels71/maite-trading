"""Shared pytest fixtures."""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

# Configure test env before importing app modules that cache settings
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["USE_MOCK_PROVIDERS"] = "true"
os.environ["DEBUG"] = "true"

from app.core.config import get_settings
from app.database.base import Base
from app.database.seed import seed_all
from app.database.session import get_engine, get_session_factory, reset_engine
from app.domain.candles import Candle
from app.main import create_app
import app.models  # noqa: F401


@pytest.fixture()
def settings():
    get_settings.cache_clear()
    reset_engine()
    return get_settings()


@pytest.fixture()
def db_session(settings) -> Session:
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    factory = get_session_factory()
    session = factory()
    seed_all(session)
    session.commit()
    try:
        yield session
        session.commit()
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        reset_engine()
        get_settings.cache_clear()


@pytest.fixture()
def client(db_session: Session):
    app = create_app()

    def _override_db():
        try:
            yield db_session
        finally:
            pass

    from app.database.session import get_db

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def et():
    return ZoneInfo("America/New_York")


@pytest.fixture()
def orb_session_candles(et) -> list[Candle]:
    """Build a single RTH session with a clear opening range and breakouts."""
    day = datetime(2024, 6, 3, tzinfo=et)  # Monday
    candles: list[Candle] = []
    # Opening range 09:30-09:34: flat around 100
    base = Decimal("100")
    for minute in range(0, 5):
        ts = day.replace(hour=9, minute=30) + timedelta(minutes=minute)
        candles.append(
            Candle(
                symbol="SPY",
                timestamp=ts,
                open=base,
                high=base + Decimal("0.2"),
                low=base - Decimal("0.2"),
                close=base,
                volume=Decimal("1000"),
                timeframe="1m",
            )
        )
    # 09:35 break above high
    ts = day.replace(hour=9, minute=35)
    candles.append(
        Candle(
            symbol="SPY",
            timestamp=ts,
            open=base,
            high=Decimal("101.0"),
            low=Decimal("99.9"),
            close=Decimal("100.8"),
            volume=Decimal("2000"),
            timeframe="1m",
        )
    )
    # Hold long
    for minute in range(36, 50):
        ts = day.replace(hour=9, minute=0) + timedelta(minutes=minute)
        candles.append(
            Candle(
                symbol="SPY",
                timestamp=ts,
                open=Decimal("100.8"),
                high=Decimal("101.0"),
                low=Decimal("100.5"),
                close=Decimal("100.7"),
                volume=Decimal("1500"),
                timeframe="1m",
            )
        )
    # Reverse short — break below range low (99.8)
    ts = day.replace(hour=9, minute=50)
    candles.append(
        Candle(
            symbol="SPY",
            timestamp=ts,
            open=Decimal("100.0"),
            high=Decimal("100.1"),
            low=Decimal("99.0"),
            close=Decimal("99.2"),
            volume=Decimal("2500"),
            timeframe="1m",
        )
    )
    # Hold short until near close
    for minute in range(51, 60):
        ts = day.replace(hour=9, minute=0) + timedelta(minutes=minute)
        candles.append(
            Candle(
                symbol="SPY",
                timestamp=ts,
                open=Decimal("99.2"),
                high=Decimal("99.4"),
                low=Decimal("99.0"),
                close=Decimal("99.1"),
                volume=Decimal("1200"),
                timeframe="1m",
            )
        )
    # Afternoon bars to reach session end flatten
    for minute in range(0, 30):
        ts = day.replace(hour=15, minute=minute)
        candles.append(
            Candle(
                symbol="SPY",
                timestamp=ts,
                open=Decimal("99.1"),
                high=Decimal("99.3"),
                low=Decimal("98.9"),
                close=Decimal("99.0"),
                volume=Decimal("1100"),
                timeframe="1m",
            )
        )
    # Final bar near 15:59
    ts = day.replace(hour=15, minute=59)
    candles.append(
        Candle(
            symbol="SPY",
            timestamp=ts,
            open=Decimal("99.0"),
            high=Decimal("99.1"),
            low=Decimal("98.8"),
            close=Decimal("98.9"),
            volume=Decimal("3000"),
            timeframe="1m",
        )
    )
    return candles

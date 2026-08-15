"""API tests with SQLite dependency override."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.database.seed import seed_all
from app.database.session import get_db
from app.domain.candles import Candle
from app.main import app
from app.services.market_data_service import MarketDataService


@pytest.fixture()
def client() -> TestClient:
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

    # Seed synthetic SPY candles for ORB day
    mds = MarketDataService(session)
    instrument = mds.get_instrument("SPY", market_type="etf")
    et_times = [
        (9, 30, "100", "99", "99.5"),
        (9, 35, "101", "100", "100.5"),
        (15, 55, "101", "100", "100.8"),
    ]
    from zoneinfo import ZoneInfo

    et = ZoneInfo("America/New_York")
    candles = [
        Candle(
            timestamp=datetime(2026, 1, 5, h, m, tzinfo=et),
            open=Decimal(close),
            high=Decimal(high),
            low=Decimal(low),
            close=Decimal(close),
            volume=Decimal("10"),
            ticker="SPY",
            timeframe="5m",
        )
        for h, m, high, low, close in et_times
    ]
    mds.save_candles(instrument.id, "5m", candles)
    session.commit()

    def _override_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    session.close()
    engine.dispose()


def test_health(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_list_instruments_and_strategies(client: TestClient) -> None:
    instruments = client.get("/instruments")
    assert instruments.status_code == 200
    symbols = {i["symbol"] for i in instruments.json()["items"]}
    assert {"SPY", "MNQ", "MES", "6E", "6A", "6B", "GC"} <= symbols
    assert "NQ" not in symbols
    assert "ES" not in symbols

    strategies = client.get("/strategies")
    assert strategies.status_code == 200
    names = {s["name"] for s in strategies.json()["items"]}
    assert "opening_range_breakout" in names


def test_list_candles(client: TestClient) -> None:
    res = client.get(
        "/market-data/candles",
        params={
            "ticker": "SPY",
            "timeframe": "5m",
            "start": "2026-01-05T00:00:00+00:00",
            "end": "2026-01-05T23:59:59+00:00",
            "market_type": "etf",
        },
    )
    assert res.status_code == 200, res.text
    assert len(res.json()["items"]) >= 1


def test_evaluate_and_backtest(client: TestClient) -> None:
    evaluate = client.post(
        "/strategy/evaluate",
        json={
            "ticker": "SPY",
            "strategy": "opening_range_breakout",
            "timeframe": "5m",
            "date": "2026-01-05",
            "market_type": "etf",
        },
    )
    assert evaluate.status_code == 200, evaluate.text
    body = evaluate.json()
    assert body["metrics"]["total_trades"] >= 1

    backtest = client.post(
        "/strategy/backtest",
        json={
            "ticker": "SPY",
            "strategy": "opening_range_breakout",
            "timeframe": "5m",
            "start_date": "2026-01-05",
            "end_date": "2026-01-05",
            "market_type": "etf",
            "persist": True,
        },
    )
    assert backtest.status_code == 200, backtest.text
    bt = backtest.json()
    assert bt["total_trades"] >= 1
    assert bt["run_id"] is not None


def test_strategy_scan(client: TestClient) -> None:
    res = client.post(
        "/strategy/scan",
        json={
            "strategies": ["opening_range_breakout"],
            "timeframe": "5m",
            "session_date": "2026-01-05",
            "data_provider": "schwab",
            "symbols": ["SPY"],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_checked"] == 1
    hit = body["hits"][0]
    assert hit["symbol"] == "SPY"
    assert hit["status"] != "no_data"
    # Historical session: ORB closes same day → flat_after_trades (not a live match).
    assert hit["status"] == "flat_after_trades"
    assert hit["matched"] is False
    assert body["match_count"] == 0

    empty = client.post(
        "/strategy/scan",
        json={
            "strategies": ["opening_range_breakout"],
            "timeframe": "5m",
            "session_date": "2026-01-06",
            "symbols": ["SPY"],
            "data_provider": "schwab",
        },
    )
    assert empty.status_code == 200, empty.text
    assert empty.json()["hits"][0]["status"] == "no_data"

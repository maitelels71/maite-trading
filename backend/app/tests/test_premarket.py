"""Premarket API tests (in-memory persistence when not on Dynamo)."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.database.seed import seed_all
from app.database.session import get_db
from app.domain.candles import Candle
from app.main import app
from app.services.market_data_service import MarketDataService
from app.services.premarket_service import clear_memory_store


def _client_with_spy_candles() -> TestClient:
    clear_memory_store()
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

    from datetime import datetime
    from decimal import Decimal
    from zoneinfo import ZoneInfo

    mds = MarketDataService(session)
    instrument = mds.get_instrument("SPY", market_type="etf")
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
        for h, m, high, low, close in [
            (9, 30, "100", "99", "99.5"),
            (9, 35, "101", "100", "100.5"),
            (15, 55, "101", "100", "100.8"),
        ]
    ]
    mds.save_candles(instrument.id, "5m", candles)
    session.commit()

    def _override_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


def test_premarket_start_and_load_result() -> None:
    with _client_with_spy_candles() as client:
        missing = client.get("/premarket/evaluate/result")
        assert missing.status_code == 404

        start = client.post(
            "/premarket/evaluate/start",
            json={
                "session_date": "2026-01-05",
                "timeframe": "5m",
                "data_provider": "schwab",
                "symbols": ["SPY"],
            },
        )
        assert start.status_code == 200, start.text
        body = start.json()
        assert body["run_id"]
        assert body["summary"]["total_checked"] >= 1
        assert body["strategy_groups"]
        assert any(g["strategy"] == "opening_range_breakout" for g in body["strategy_groups"])

        latest = client.get("/premarket/evaluate/result")
        assert latest.status_code == 200, latest.text
        assert latest.json()["run_id"] == body["run_id"]

        by_id = client.get(
            "/premarket/evaluate/result",
            params={"run_id": body["run_id"]},
        )
        assert by_id.status_code == 200
        assert by_id.json()["session_date"] == "2026-01-05"

    app.dependency_overrides.clear()
    clear_memory_store()


def test_premarket_alarm_check() -> None:
    with _client_with_spy_candles() as client:
        res = client.post(
            "/premarket/alarm/check",
            json={
                "symbol": "SPY",
                "strategy": "opening_range_breakout",
                "session_date": "2026-01-05",
                "timeframe": "5m",
                "data_provider": "schwab",
            },
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["symbol"] == "SPY"
        assert body["strategy"] == "opening_range_breakout"
        assert "met" in body
        assert body["status"]
        assert body["checked_at"]

    app.dependency_overrides.clear()
    clear_memory_store()

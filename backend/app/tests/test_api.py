"""API endpoint tests."""

from datetime import datetime
from zoneinfo import ZoneInfo


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "app" in body


def test_list_instruments(client):
    resp = client.get("/instruments")
    assert resp.status_code == 200
    symbols = {row["symbol"] for row in resp.json()}
    assert "SPY" in symbols
    assert "NQ" in symbols
    assert len(symbols) == 8


def test_list_strategies(client):
    resp = client.get("/strategies")
    assert resp.status_code == 200
    ids = {row["id"] for row in resp.json()}
    assert "opening_range_breakout" in ids


def test_market_data_sync(client):
    et = ZoneInfo("America/New_York")
    payload = {
        "symbol": "AMZN",
        "timeframe": "1m",
        "start": datetime(2024, 6, 3, 9, 30, tzinfo=et).isoformat(),
        "end": datetime(2024, 6, 3, 10, 0, tzinfo=et).isoformat(),
        "force_refresh": True,
    }
    resp = client.post("/market-data/sync", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["symbol"] == "AMZN"
    assert body["provider"] == "schwab"
    assert body["fetched"] > 0


def test_strategy_evaluate(client, orb_session_candles):
    payload = {
        "strategy_id": "opening_range_breakout",
        "symbol": "SPY",
        "candles": [
            {
                "timestamp": c.timestamp.isoformat(),
                "open": str(c.open),
                "high": str(c.high),
                "low": str(c.low),
                "close": str(c.close),
                "volume": str(c.volume),
                "timeframe": c.timeframe,
            }
            for c in orb_session_candles
        ],
        "params": {"opening_range_minutes": 5, "quantity": "1"},
    }
    resp = client.post("/strategy/evaluate", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["strategy_id"] == "opening_range_breakout"
    assert len(body["signals"]) > 0
    assert len(body["trades"]) > 0


def test_strategy_backtest(client):
    et = ZoneInfo("America/New_York")
    payload = {
        "strategy_id": "opening_range_breakout",
        "symbol": "QQQ",
        "timeframe": "1m",
        "start": datetime(2024, 6, 3, 9, 30, tzinfo=et).isoformat(),
        "end": datetime(2024, 6, 3, 16, 0, tzinfo=et).isoformat(),
        "sync_first": True,
        "params": {"opening_range_minutes": 5},
    }
    resp = client.post("/strategy/backtest", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["backtest_run_id"] >= 1
    assert body["symbol"] == "QQQ"

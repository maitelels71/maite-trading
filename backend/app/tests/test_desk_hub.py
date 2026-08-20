"""Hub login + Coinbase dashboard API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services.coinbase_bot import BotRunResult
from app.services.coinbase_run_log import append_run, compute_stats, list_runs


def test_login_and_me(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "desk_login_user", "maite")
    monkeypatch.setattr(settings, "desk_login_password", "boss")
    monkeypatch.setattr(settings, "desk_session_secret", "test-secret")
    client = TestClient(app)
    denied = client.post("/auth/login", json={"username": "maite", "password": "nope"})
    assert denied.status_code == 401
    ok = client.post("/auth/login", json={"username": "maite", "password": "boss"})
    assert ok.status_code == 200
    token = ok.json()["token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["user"] == "maite"
    blocked = client.get("/coinbase/status")
    assert blocked.status_code == 401


def test_run_log_stats(tmp_path, monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "coinbase_runs_path", str(tmp_path / "runs.json"))
    result = BotRunResult(
        dry_run=True,
        quote="USD",
        weights={"BTC": 0.6, "ETH": 0.3, "CASH": 0.1},
        holdings={"USD": "10", "BTC": "0.001"},
        prices={"BTC": "70000"},
        orders=[
            {
                "product_id": "ETH-USD",
                "asset": "ETH",
                "side": "BUY",
                "quote_size": "25.00",
                "base_size": None,
                "notional": "25.00",
                "reason": "test",
            }
        ],
        submissions=[],
        portfolio_value="80.00",
    )
    append_run(result)
    stats = compute_stats()
    assert stats["total_runs"] == 1
    assert stats["dry_runs"] == 1
    assert stats["last_portfolio_value"] == "80.00"
    assert list_runs()[0]["dry_run"] is True


def test_coinbase_status_requires_login(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "desk_login_user", "maite")
    monkeypatch.setattr(settings, "desk_login_password", "boss")
    monkeypatch.setattr(settings, "desk_session_secret", "test-secret")
    client = TestClient(app)
    token = client.post(
        "/auth/login", json={"username": "maite", "password": "boss"}
    ).json()["token"]
    status = client.get(
        "/coinbase/status", headers={"Authorization": f"Bearer {token}"}
    )
    assert status.status_code == 200
    body = status.json()
    assert "configured" in body
    assert "trading_enabled" in body
    assert "max_trade_usd" in body
    assert "lookback_days" in body


def test_coinbase_plan_settings_roundtrip(tmp_path, monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "desk_login_user", "maite")
    monkeypatch.setattr(settings, "desk_login_password", "boss")
    monkeypatch.setattr(settings, "desk_session_secret", "test-secret")
    monkeypatch.setattr(
        settings,
        "coinbase_settings_path",
        str(tmp_path / "plan.json"),
    )
    client = TestClient(app)
    token = client.post(
        "/auth/login", json={"username": "maite", "password": "boss"}
    ).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    saved = client.put(
        "/coinbase/settings",
        headers=headers,
        json={
            "max_trade_usd": 40,
            "min_trade_usd": 8,
            "cash_pct": 0.15,
            "rebalance_threshold_pct": 6,
            "lookback_days": 21,
        },
    )
    assert saved.status_code == 200
    status = client.get("/coinbase/status", headers=headers)
    assert status.status_code == 200
    body = status.json()
    assert body["max_trade_usd"] == 40
    assert body["min_trade_usd"] == 8
    assert body["cash_pct"] == 0.15
    assert body["lookback_days"] == 21
    denied = client.put(
        "/coinbase/settings",
        headers=headers,
        json={
            "max_trade_usd": 5,
            "min_trade_usd": 25,
            "cash_pct": 0.1,
            "rebalance_threshold_pct": 5,
            "lookback_days": 30,
        },
    )
    assert denied.status_code == 400

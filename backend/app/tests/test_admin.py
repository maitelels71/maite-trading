"""Admin API unit tests."""

from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app
from app.providers import schwab_oauth


def test_admin_schwab_status_from_file(tmp_path: Path, monkeypatch) -> None:
    token_path = tmp_path / "schwab_token.json"
    expires_at = time.time() + 900
    token_path.write_text(
        json.dumps(
            {
                "access_token": "a",
                "refresh_token": "r",
                "expires_at": expires_at,
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        schwab_oauth,
        "settings",
        Settings(
            SCHWAB_CLIENT_ID="cid",
            SCHWAB_CLIENT_SECRET="sec",
            SCHWAB_TOKEN_PATH=str(token_path),
        ),
    )
    # token_status uses config or settings — patch get via force path on module settings used by API
    monkeypatch.setenv("SCHWAB_TOKEN_PATH", str(token_path))
    monkeypatch.setenv("SCHWAB_CLIENT_ID", "cid")
    monkeypatch.setenv("SCHWAB_CLIENT_SECRET", "sec")

    # Re-read: API uses app settings singleton — call token_status directly
    monkeypatch.delenv("SCHWAB_TOKEN_JSON", raising=False)
    status = schwab_oauth.token_status(
        Settings(
            SCHWAB_CLIENT_ID="cid",
            SCHWAB_CLIENT_SECRET="sec",
            SCHWAB_TOKEN_PATH=str(token_path),
            SCHWAB_TOKEN_JSON="",
        )
    )
    assert status["has_access_token"] is True
    assert status["source"] == "file"
    assert status["expired"] is False
    assert status["expires_in_seconds"] is not None
    assert status["expires_in_seconds"] > 0


def test_admin_overview_endpoint() -> None:
    client = TestClient(app)
    res = client.get("/admin/overview")
    assert res.status_code == 200
    body = res.json()
    assert "schwab" in body
    assert "notes" in body
    assert isinstance(body["notes"], list)

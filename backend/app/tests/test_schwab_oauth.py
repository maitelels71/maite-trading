"""Schwab OAuth token exchange / refresh unit tests."""

from __future__ import annotations

import json
from pathlib import Path

import httpx

from app.core.config import Settings
from app.providers.schwab_oauth import (
    build_authorize_url,
    exchange_authorization_code,
    load_token,
    refresh_access_token,
    upsert_token_blob,
)


def test_build_authorize_url_includes_client_and_redirect() -> None:
    cfg = Settings(
        SCHWAB_CLIENT_ID="cid123",
        SCHWAB_CLIENT_SECRET="sec",
        SCHWAB_REDIRECT_URI="https://127.0.0.1:8182",
    )
    url = build_authorize_url(cfg)
    assert "client_id=cid123" in url
    assert "redirect_uri=" in url
    assert "api.schwabapi.com/v1/oauth/authorize" in url


def test_exchange_authorization_code_saves_token(tmp_path: Path) -> None:
    token_path = tmp_path / "schwab_token.json"
    cfg = Settings(
        SCHWAB_CLIENT_ID="cid",
        SCHWAB_CLIENT_SECRET="sec",
        SCHWAB_REDIRECT_URI="https://127.0.0.1:8182",
        SCHWAB_TOKEN_PATH=str(token_path),
    )

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/oauth/token")
        return httpx.Response(
            200,
            json={
                "access_token": "access-xyz",
                "refresh_token": "refresh-xyz",
                "expires_in": 1800,
                "token_type": "Bearer",
            },
        )

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as client:
        token = exchange_authorization_code("AUTHCODE", config=cfg, client=client)

    assert token["access_token"] == "access-xyz"
    saved = json.loads(token_path.read_text(encoding="utf-8"))
    assert saved["refresh_token"] == "refresh-xyz"
    assert load_token(cfg)["access_token"] == "access-xyz"


def test_load_token_from_env_json() -> None:
    blob = json.dumps(
        {
            "access_token": "from-env",
            "refresh_token": "r1",
            "expires_at": 9_999_999_999,
        }
    )
    cfg = Settings(
        SCHWAB_TOKEN_PATH="/nonexistent/schwab_token.json",
        SCHWAB_TOKEN_JSON=blob,
    )
    assert load_token(cfg)["access_token"] == "from-env"


def test_load_token_prefers_newer_expiry(tmp_path: Path) -> None:
    token_path = tmp_path / "schwab_token.json"
    token_path.write_text(
        json.dumps(
            {
                "access_token": "old-file",
                "refresh_token": "r-old",
                "expires_at": 1_000,
            }
        ),
        encoding="utf-8",
    )
    cfg = Settings(
        SCHWAB_TOKEN_PATH=str(token_path),
        SCHWAB_TOKEN_JSON=json.dumps(
            {
                "access_token": "new-env",
                "refresh_token": "r-new",
                "expires_at": 9_999_999_999,
            }
        ),
    )
    assert load_token(cfg)["access_token"] == "new-env"


def test_refresh_keeps_refresh_token_when_omitted(tmp_path: Path) -> None:
    token_path = tmp_path / "schwab_token.json"
    cfg = Settings(
        SCHWAB_CLIENT_ID="cid",
        SCHWAB_CLIENT_SECRET="sec",
        SCHWAB_TOKEN_PATH=str(token_path),
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"access_token": "new-access", "expires_in": 1800},
        )

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as client:
        token = refresh_access_token("old-refresh", config=cfg, client=client)

    assert token["access_token"] == "new-access"
    assert token["refresh_token"] == "old-refresh"


def test_upsert_token_blob_saves(tmp_path: Path) -> None:
    token_path = tmp_path / "schwab_token.json"
    cfg = Settings(
        SCHWAB_CLIENT_ID="cid",
        SCHWAB_CLIENT_SECRET="sec",
        SCHWAB_TOKEN_PATH=str(token_path),
    )
    status = upsert_token_blob(
        {
            "access_token": "a1",
            "refresh_token": "r1",
            "expires_in": 1800,
        },
        publish=False,
        config=cfg,
    )
    assert status["has_access_token"] is True
    assert status["source"] == "file"
    saved = json.loads(token_path.read_text(encoding="utf-8"))
    assert saved["refresh_token"] == "r1"

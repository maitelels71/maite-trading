"""Signed desk-session tokens for the Trading Like a Boss hub."""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any

from fastapi import Header, HTTPException

from app.core.config import Settings, settings

TOKEN_TTL_SEC = 7 * 24 * 3600


def _secret(config: Settings) -> bytes:
    raw = (config.desk_session_secret or "").strip()
    if not raw:
        raw = f"desk:{config.desk_login_user}:{config.desk_login_password}"
    return hashlib.sha256(raw.encode("utf-8")).digest()


def mint_token(user: str, config: Settings | None = None) -> str:
    cfg = config or settings
    exp = int(time.time()) + TOKEN_TTL_SEC
    payload = f"{user}.{exp}"
    sig = hmac.new(_secret(cfg), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def verify_token(token: str, config: Settings | None = None) -> str | None:
    cfg = config or settings
    parts = (token or "").split(".")
    if len(parts) != 3:
        return None
    user, exp_raw, sig = parts
    try:
        exp = int(exp_raw)
    except ValueError:
        return None
    if exp < int(time.time()):
        return None
    payload = f"{user}.{exp_raw}"
    expected = hmac.new(_secret(cfg), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    if user != (cfg.desk_login_user or "").strip():
        return None
    return user


def login(username: str, password: str, config: Settings | None = None) -> str:
    cfg = config or settings
    expected_user = (cfg.desk_login_user or "").strip()
    expected_pw = cfg.desk_login_password or ""
    if not expected_pw:
        raise HTTPException(
            status_code=503,
            detail="Set DESK_LOGIN_PASSWORD in .env to enable hub login",
        )
    user_ok = hmac.compare_digest(username.strip(), expected_user)
    pw_ok = hmac.compare_digest(password, expected_pw)
    if not (user_ok and pw_ok):
        raise HTTPException(status_code=401, detail="Invalid user or password")
    return mint_token(expected_user, cfg)


def require_desk_session(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    raw = (authorization or "").strip()
    if raw.lower().startswith("bearer "):
        raw = raw[7:].strip()
    user = verify_token(raw)
    if not user:
        raise HTTPException(status_code=401, detail="Please log in")
    return {"user": user}

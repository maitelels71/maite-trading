"""Schwab OAuth2 helpers — authorize URL, token exchange, refresh, token store."""

from __future__ import annotations

import base64
import json
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import Settings, settings
from app.core.logging import get_logger
from app.providers.exceptions import ProviderNotConfiguredError

logger = get_logger(__name__)

SCHWAB_AUTHORIZE_URL = "https://api.schwabapi.com/v1/oauth/authorize"
SCHWAB_TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token"


def _basic_auth_header(client_id: str, client_secret: str) -> str:
    raw = f"{client_id}:{client_secret}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def resolve_token_path(config: Settings | None = None) -> Path:
    cfg = config or settings
    path = Path(cfg.schwab_token_path)
    if path.is_absolute():
        return path
    # Lambda: only /tmp is writable
    if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return Path("/tmp") / "schwab_token.json"
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / path


def build_authorize_url(config: Settings | None = None) -> str:
    cfg = config or settings
    if not cfg.schwab_client_id:
        raise ProviderNotConfiguredError("SCHWAB_CLIENT_ID is not set")
    qs = urlencode(
        {
            "client_id": cfg.schwab_client_id,
            "redirect_uri": cfg.schwab_redirect_uri,
        }
    )
    return f"{SCHWAB_AUTHORIZE_URL}?{qs}"


def _parse_token_blob(raw: str | None) -> dict[str, Any] | None:
    if not raw or not str(raw).strip():
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or not data.get("access_token"):
        return None
    return data


def load_token(config: Settings | None = None) -> dict[str, Any] | None:
    cfg = config or settings
    path = resolve_token_path(cfg)
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            logger.warning("schwab_token_unreadable path=%s", path)
            data = None
        if isinstance(data, dict) and data.get("access_token"):
            return data

    # Secrets Manager → env (see secrets_loader) or explicit settings
    env_blob = (cfg.schwab_token_json or os.environ.get("SCHWAB_TOKEN_JSON") or "").strip()
    parsed = _parse_token_blob(env_blob)
    if parsed:
        return parsed
    return None


def _persist_token_to_secrets_manager(token: dict[str, Any]) -> None:
    """Best-effort: keep SCHWAB_TOKEN_JSON in APP_SECRETS_ARN up to date (Lambda)."""
    arn = (os.environ.get("APP_SECRETS_ARN") or "").strip()
    if not arn:
        return
    try:
        import boto3

        client = boto3.client("secretsmanager")
        raw = client.get_secret_value(SecretId=arn).get("SecretString") or "{}"
        data = json.loads(raw)
        if not isinstance(data, dict):
            return
        data["SCHWAB_TOKEN_JSON"] = json.dumps(token)
        client.put_secret_value(SecretId=arn, SecretString=json.dumps(data))
        os.environ["SCHWAB_TOKEN_JSON"] = data["SCHWAB_TOKEN_JSON"]
        logger.info("schwab_token_synced_to_secrets_manager")
    except Exception:  # noqa: BLE001
        logger.exception("schwab_token_secrets_sync_failed")


def save_token(token: dict[str, Any], config: Settings | None = None) -> Path:
    cfg = config or settings
    path = resolve_token_path(cfg)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(token)
    if "expires_at" not in payload and payload.get("expires_in"):
        payload["expires_at"] = time.time() + float(payload["expires_in"])
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass
    # Keep process env warm + Secrets Manager for next Lambda cold start
    os.environ["SCHWAB_TOKEN_JSON"] = json.dumps(payload)
    _persist_token_to_secrets_manager(payload)
    return path


def exchange_authorization_code(
    code: str,
    *,
    config: Settings | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    cfg = config or settings
    if not cfg.schwab_client_id or not cfg.schwab_client_secret:
        raise ProviderNotConfiguredError(
            "SCHWAB_CLIENT_ID and SCHWAB_CLIENT_SECRET must be set"
        )
    clean = code.strip()
    own_client = client is None
    http = client or httpx.Client(timeout=30.0)
    try:
        response = http.post(
            SCHWAB_TOKEN_URL,
            headers={
                "Authorization": _basic_auth_header(
                    cfg.schwab_client_id, cfg.schwab_client_secret
                ),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "authorization_code",
                "code": clean,
                "redirect_uri": cfg.schwab_redirect_uri,
            },
        )
    finally:
        if own_client:
            http.close()

    if response.status_code >= 400:
        raise ProviderNotConfiguredError(
            f"Schwab token exchange failed ({response.status_code}): {response.text[:400]}"
        )
    token = response.json()
    if not token.get("access_token"):
        raise ProviderNotConfiguredError("Schwab token response missing access_token")
    token["expires_at"] = time.time() + float(token.get("expires_in") or 1800)
    save_token(token, cfg)
    return token


def refresh_access_token(
    refresh_token: str,
    *,
    config: Settings | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    cfg = config or settings
    if not cfg.schwab_client_id or not cfg.schwab_client_secret:
        raise ProviderNotConfiguredError(
            "SCHWAB_CLIENT_ID and SCHWAB_CLIENT_SECRET must be set"
        )
    own_client = client is None
    http = client or httpx.Client(timeout=30.0)
    try:
        response = http.post(
            SCHWAB_TOKEN_URL,
            headers={
                "Authorization": _basic_auth_header(
                    cfg.schwab_client_id, cfg.schwab_client_secret
                ),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
        )
    finally:
        if own_client:
            http.close()

    if response.status_code >= 400:
        raise ProviderNotConfiguredError(
            f"Schwab token refresh failed ({response.status_code}): {response.text[:400]}"
        )
    token = response.json()
    if not token.get("refresh_token"):
        token["refresh_token"] = refresh_token
    token["expires_at"] = time.time() + float(token.get("expires_in") or 1800)
    save_token(token, cfg)
    return token


def get_valid_access_token(config: Settings | None = None) -> str:
    """Load token (file or SCHWAB_TOKEN_JSON); refresh if expired (60s skew)."""
    cfg = config or settings
    token = load_token(cfg)
    if not token:
        raise ProviderNotConfiguredError(
            "No Schwab token on disk. Run: python -m scripts.schwab_login"
        )
    expires_at = float(token.get("expires_at") or 0)
    if expires_at and expires_at > time.time() + 60:
        return str(token["access_token"])

    refresh = token.get("refresh_token")
    if not refresh:
        raise ProviderNotConfiguredError(
            "Schwab access token expired and no refresh_token. Re-run schwab_login."
        )
    logger.info("schwab_refreshing_access_token")
    refreshed = refresh_access_token(str(refresh), config=cfg)
    return str(refreshed["access_token"])


def token_status(config: Settings | None = None) -> dict[str, Any]:
    """Safe status for Admin UI (never returns raw tokens)."""
    cfg = config or settings
    path = resolve_token_path(cfg)
    source = "none"
    token: dict[str, Any] | None = None

    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = None
        if isinstance(data, dict) and data.get("access_token"):
            token = data
            source = "file"

    if token is None:
        env_blob = (cfg.schwab_token_json or os.environ.get("SCHWAB_TOKEN_JSON") or "").strip()
        token = _parse_token_blob(env_blob)
        if token:
            source = "env"

    expires_at = float(token.get("expires_at") or 0) if token else 0.0
    now = time.time()
    expires_in = int(expires_at - now) if expires_at else None
    return {
        "configured": bool(cfg.schwab_client_id and cfg.schwab_client_secret),
        "has_access_token": bool(token and token.get("access_token")),
        "has_refresh_token": bool(token and token.get("refresh_token")),
        "expires_at": expires_at or None,
        "expires_at_iso": (
            time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(expires_at))
            if expires_at
            else None
        ),
        "expires_in_seconds": expires_in,
        "expired": bool(expires_at and expires_at <= now),
        "source": source,
        "publish_available": bool((os.environ.get("APP_SECRETS_ARN") or "").strip()),
        "token_path": str(path),
    }


def force_refresh_token(config: Settings | None = None) -> dict[str, Any]:
    """Always refresh via refresh_token; returns safe status."""
    cfg = config or settings
    token = load_token(cfg)
    if not token or not token.get("refresh_token"):
        raise ProviderNotConfiguredError(
            "No Schwab refresh_token. Run: python -m scripts.schwab_login"
        )
    refresh_access_token(str(token["refresh_token"]), config=cfg)
    return token_status(cfg)


def publish_token_to_secrets(config: Settings | None = None) -> dict[str, Any]:
    """Write current token JSON into APP_SECRETS_ARN (SCHWAB_TOKEN_JSON)."""
    cfg = config or settings
    token = load_token(cfg)
    if not token:
        raise ProviderNotConfiguredError(
            "No Schwab token to publish. Run schwab_login (local) first."
        )
    arn = (os.environ.get("APP_SECRETS_ARN") or "").strip()
    if not arn:
        raise ProviderNotConfiguredError(
            "APP_SECRETS_ARN is not set — publish only works on staging Lambda "
            "or a local process with that env var."
        )
    try:
        import boto3

        client = boto3.client("secretsmanager")
        raw = client.get_secret_value(SecretId=arn).get("SecretString") or "{}"
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ProviderNotConfiguredError("App secret is not a JSON object")
        data["SCHWAB_TOKEN_JSON"] = json.dumps(token)
        client.put_secret_value(SecretId=arn, SecretString=json.dumps(data))
        os.environ["SCHWAB_TOKEN_JSON"] = data["SCHWAB_TOKEN_JSON"]
        logger.info("schwab_token_published_to_secrets_manager")
    except ProviderNotConfiguredError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ProviderNotConfiguredError(
            f"Failed to publish Schwab token to Secrets Manager: {exc}"
        ) from exc
    status = token_status(cfg)
    status["published"] = True
    status["secret_arn_set"] = True
    return status


def upsert_token_blob(
    raw: str | dict[str, Any],
    *,
    publish: bool = True,
    config: Settings | None = None,
) -> dict[str, Any]:
    """Accept pasted Schwab token JSON (file contents) and store it.

    Expected keys: access_token, refresh_token; optional expires_in / expires_at.
    """
    cfg = config or settings
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            raise ProviderNotConfiguredError("Token JSON is empty")
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ProviderNotConfiguredError(
                "Token must be valid JSON (paste contents of schwab_token.json)"
            ) from exc
    else:
        parsed = raw

    if not isinstance(parsed, dict):
        raise ProviderNotConfiguredError("Token JSON must be an object")
    if not parsed.get("access_token"):
        raise ProviderNotConfiguredError("Token JSON missing access_token")
    if not parsed.get("refresh_token"):
        raise ProviderNotConfiguredError("Token JSON missing refresh_token")

    token = dict(parsed)
    if "expires_at" not in token:
        expires_in = float(token.get("expires_in") or 1800)
        token["expires_at"] = time.time() + expires_in

    save_token(token, cfg)
    if publish and (os.environ.get("APP_SECRETS_ARN") or "").strip():
        return publish_token_to_secrets(cfg)
    status = token_status(cfg)
    status["published"] = False
    return status

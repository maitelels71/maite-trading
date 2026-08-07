"""Admin endpoints — Schwab token status, OAuth login, refresh, publish."""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.storage_backend import using_dynamo
from app.providers.exceptions import ProviderNotConfiguredError
from app.providers.schwab_oauth import (
    build_authorize_url,
    exchange_authorization_code,
    force_refresh_token,
    publish_token_to_secrets,
    token_status,
    upsert_token_blob,
)

router = APIRouter(prefix="/admin", tags=["admin"])


class SchwabStatusOut(BaseModel):
    configured: bool
    has_access_token: bool
    has_refresh_token: bool
    expires_at: float | None = None
    expires_at_iso: str | None = None
    expires_in_seconds: int | None = None
    expired: bool = False
    source: str = "none"
    publish_available: bool = False
    token_path: str | None = None
    published: bool | None = None
    secret_arn_set: bool | None = None


class SchwabLoginLinkOut(BaseModel):
    authorize_url: str
    redirect_uri: str
    callback_path: str = "/admin/schwab/callback"
    portal_hint: str


class AdminOverviewOut(BaseModel):
    environment: str
    storage_backend: str
    using_dynamo: bool
    api_secrets_arn_set: bool = Field(
        description="True when APP_SECRETS_ARN is present (staging publish path)"
    )
    schwab: SchwabStatusOut
    schwab_login: SchwabLoginLinkOut | None = None
    notes: list[str]


def _login_link() -> SchwabLoginLinkOut | None:
    if not settings.schwab_client_id:
        return None
    try:
        url = build_authorize_url()
    except ProviderNotConfiguredError:
        return None
    return SchwabLoginLinkOut(
        authorize_url=url,
        redirect_uri=settings.schwab_redirect_uri,
        portal_hint=(
            "In the Schwab developer portal, set Callback URL to exactly this redirect_uri. "
            "Then use Login with Schwab — after Approve, tokens are saved automatically."
        ),
    )


@router.get("/overview", response_model=AdminOverviewOut)
def admin_overview() -> AdminOverviewOut:
    schwab = SchwabStatusOut(**token_status())
    notes = [
        "Prefer Refresh while the refresh_token is valid (~days). Access tokens expire ~30 min (Schwab rule).",
        "Login with Schwab opens OAuth when you need a brand-new auth (refresh failed or first setup).",
        "Callback URL in Schwab portal must match SCHWAB_REDIRECT_URI on this API.",
        "Token storage: `.secrets/schwab_token.json` locally, or Secrets Manager SCHWAB_TOKEN_JSON on staging.",
    ]
    return AdminOverviewOut(
        environment=settings.environment,
        storage_backend=settings.storage_backend,
        using_dynamo=using_dynamo(),
        api_secrets_arn_set=bool((os.environ.get("APP_SECRETS_ARN") or "").strip()),
        schwab=schwab,
        schwab_login=_login_link(),
        notes=notes,
    )


@router.get("/schwab/status", response_model=SchwabStatusOut)
def schwab_status() -> SchwabStatusOut:
    return SchwabStatusOut(**token_status())


@router.get("/schwab/login-link", response_model=SchwabLoginLinkOut)
def schwab_login_link() -> SchwabLoginLinkOut:
    link = _login_link()
    if not link:
        raise HTTPException(
            status_code=400,
            detail="SCHWAB_CLIENT_ID is not configured",
        )
    return link


@router.get("/schwab/callback", response_class=HTMLResponse)
def schwab_oauth_callback(
    code: str | None = Query(None),
    error: str | None = Query(None),
) -> HTMLResponse:
    """Schwab redirects here after Approve. Must match SCHWAB_REDIRECT_URI."""
    if error:
        return HTMLResponse(
            _html_page(
                "Schwab login failed",
                f"OAuth error: <code>{error}</code>",
                ok=False,
            ),
            status_code=400,
        )
    if not code:
        return HTMLResponse(
            _html_page(
                "Schwab login failed",
                "Missing authorization <code>code</code> in callback.",
                ok=False,
            ),
            status_code=400,
        )
    try:
        exchange_authorization_code(code)
        # Ensure Secrets Manager has the fresh blob when running on staging
        if (os.environ.get("APP_SECRETS_ARN") or "").strip():
            try:
                publish_token_to_secrets()
            except ProviderNotConfiguredError:
                pass
    except ProviderNotConfiguredError as exc:
        return HTMLResponse(
            _html_page("Schwab login failed", str(exc), ok=False),
            status_code=400,
        )
    except Exception as exc:  # noqa: BLE001
        return HTMLResponse(
            _html_page("Schwab login failed", str(exc), ok=False),
            status_code=400,
        )

    return HTMLResponse(
        _html_page(
            "Schwab connected",
            "Authorization saved. You can close this tab and return to Admin → Reload status.",
            ok=True,
        )
    )


@router.post("/schwab/refresh", response_model=SchwabStatusOut)
def schwab_refresh() -> SchwabStatusOut:
    try:
        return SchwabStatusOut(**force_refresh_token())
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class SchwabTokenUpsertIn(BaseModel):
    """Paste the full contents of `.secrets/schwab_token.json`."""

    token_json: str = Field(min_length=10, description="Schwab OAuth token JSON blob")
    publish: bool = Field(
        default=True,
        description="Also write SCHWAB_TOKEN_JSON into Secrets Manager when ARN is set",
    )


@router.post("/schwab/token", response_model=SchwabStatusOut)
def schwab_upsert_token(body: SchwabTokenUpsertIn) -> SchwabStatusOut:
    try:
        return SchwabStatusOut(
            **upsert_token_blob(body.token_json, publish=body.publish)
        )
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/schwab/publish", response_model=SchwabStatusOut)
def schwab_publish() -> SchwabStatusOut:
    try:
        return SchwabStatusOut(**publish_token_to_secrets())
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _html_page(title: str, body: str, *, ok: bool) -> str:
    color = "#0f766e" if ok else "#b91c1c"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{title} — Maite Trading</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; color: #1c1917; }}
    h1 {{ color: {color}; font-size: 1.35rem; }}
    p {{ line-height: 1.5; color: #57534e; }}
    code {{ font-size: 0.9em; }}
  </style>
</head>
<body>
  <h1>{title}</h1>
  <p>{body}</p>
  <p><a href="https://d2v5qh8mus9ucq.cloudfront.net">Back to Maite Trading</a></p>
</body>
</html>"""

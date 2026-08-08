"""Notion Trade Journal — one page per trade."""

from __future__ import annotations

import base64
import logging
import re
from typing import Any

import httpx

from app.core.config import Settings, get_settings
from app.providers.exceptions import ProviderError, ProviderNotConfiguredError
from app.providers.http_utils import raise_for_provider_response
from app.providers.notion import (
    NOTION_API_BASE,
    _heading,
    _paragraph,
    _rich_text,
)

logger = logging.getLogger(__name__)

# File uploads need a newer Notion-Version than page CRUD.
NOTION_FILE_VERSION = "2025-09-03"
NOTION_CRUD_VERSION = "2022-06-28"


def _cfg(config: Settings | None = None) -> Settings:
    return config or get_settings()


def journal_configured(config: Settings | None = None) -> bool:
    cfg = _cfg(config)
    return bool(
        cfg.notion_api_key.strip() and cfg.notion_journal_database_id.strip()
    )


def _client(cfg: Settings, *, version: str) -> httpx.Client:
    if not cfg.notion_api_key.strip():
        raise ProviderNotConfiguredError("NOTION_API_KEY is not set")
    return httpx.Client(
        base_url=NOTION_API_BASE,
        headers={
            "Authorization": f"Bearer {cfg.notion_api_key.strip()}",
            "Notion-Version": version,
            "Content-Type": "application/json",
        },
        timeout=60.0,
    )


def _select(name: str | None, *, allowed: set[str] | None = None) -> dict[str, Any] | None:
    value = (name or "").strip()
    if not value:
        return None
    if allowed and value not in allowed:
        value = "Other" if "Other" in allowed else sorted(allowed)[0]
    return {"select": {"name": value}}


def _number(value: float | int | None) -> dict[str, Any] | None:
    if value is None:
        return None
    return {"number": float(value)}


ACTIVO_OPTS = {"NQ", "MNQ", "ES", "MES", "YM", "RTY", "GC", "CL", "Other"}
SIDE_OPTS = {"Compra", "Venta"}
SESSION_OPTS = {"Asia", "London", "NY AM", "NY PM", "Overnight"}
PLAYBOOK_OPTS = {"SBC", "ORB", "ORB FUT", "Other"}
TF_OPTS = {"1H", "15m", "5m", "3m", "1m"}
STATUS_OPTS = {"Open", "Closed", "Scratched"}
STUCK_OPTS = {"Yes", "No", "Partial"}


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^\w.\-]+", "_", name.strip()) or "shot.jpg"
    return cleaned[:80]


def _upload_image(
    cfg: Settings,
    *,
    filename: str,
    content_type: str,
    data_base64: str,
) -> str | None:
    """Upload image via Notion File Upload API. Returns file_upload id or None."""
    raw = base64.b64decode(data_base64)
    if len(raw) > 4_500_000:
        raise ProviderError("Image too large (max ~4.5MB after decode)")
    fname = _safe_filename(filename)
    ctype = content_type or "image/jpeg"

    with _client(cfg, version=NOTION_FILE_VERSION) as client:
        create = client.post(
            "/v1/file_uploads",
            json={"filename": fname, "content_type": ctype},
        )
        if create.status_code >= 400:
            logger.warning(
                "notion_file_upload_create_failed status=%s body=%s",
                create.status_code,
                create.text[:300],
            )
            return None
        upload_id = str(create.json()["id"])

    # Send bytes as multipart (no JSON content-type)
    with httpx.Client(
        base_url=NOTION_API_BASE,
        headers={
            "Authorization": f"Bearer {cfg.notion_api_key.strip()}",
            "Notion-Version": NOTION_FILE_VERSION,
        },
        timeout=60.0,
    ) as client:
        send = client.post(
            f"/v1/file_uploads/{upload_id}/send",
            files={"file": (fname, raw, ctype)},
        )
        if send.status_code >= 400:
            logger.warning(
                "notion_file_upload_send_failed status=%s body=%s",
                send.status_code,
                send.text[:300],
            )
            return None
    return upload_id


def _image_block(file_upload_id: str, caption: str) -> dict[str, Any]:
    return {
        "object": "block",
        "type": "image",
        "image": {
            "type": "file_upload",
            "file_upload": {"id": file_upload_id},
            "caption": _rich_text(caption),
        },
    }


def _build_trade_children(
    *,
    thesis: str,
    what_happened: str,
    lesson: str,
    before_images: list[dict[str, Any]],
    after_images: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = [
        _heading("Thesis (before)", 3),
        _paragraph(thesis.strip() or "—"),
        _heading("Screenshots — before", 3),
    ]
    if before_images:
        blocks.extend(before_images)
    else:
        blocks.append(_paragraph("—"))

    blocks.extend(
        [
            _heading("What happened", 3),
            _paragraph(what_happened.strip() or "—"),
            _heading("Screenshots — after", 3),
        ]
    )
    if after_images:
        blocks.extend(after_images)
    else:
        blocks.append(_paragraph("—"))

    blocks.extend(
        [
            _heading("Lesson", 3),
            _paragraph(lesson.strip() or "—"),
        ]
    )
    return blocks[:90]


def _trade_properties(payload: dict[str, Any]) -> dict[str, Any]:
    date = str(payload.get("date") or "")
    activo = str(payload.get("activo") or "").strip() or "Other"
    side = str(payload.get("side") or "").strip() or "Compra"
    title = str(payload.get("title") or "").strip()
    if not title:
        title = f"{date} · {activo} · {side}"

    props: dict[str, Any] = {
        "Name": {"title": [{"type": "text", "text": {"content": title[:200]}}]},
        "Date": {"date": {"start": date}},
    }
    mapping = [
        ("Activo", _select(payload.get("activo"), allowed=ACTIVO_OPTS)),
        ("Side", _select(payload.get("side"), allowed=SIDE_OPTS)),
        ("Session", _select(payload.get("session"), allowed=SESSION_OPTS)),
        ("Playbook", _select(payload.get("playbook"), allowed=PLAYBOOK_OPTS)),
        ("TF setup", _select(payload.get("tf_setup"), allowed=TF_OPTS)),
        ("Status", _select(payload.get("status"), allowed=STATUS_OPTS)),
        ("Stuck to plan?", _select(payload.get("stuck_to_plan"), allowed=STUCK_OPTS)),
        ("Entry", _number(payload.get("entry"))),
        ("SL", _number(payload.get("sl"))),
        ("TP", _number(payload.get("tp"))),
        ("BE", _number(payload.get("be"))),
        ("R planned", _number(payload.get("r_planned"))),
        ("R real", _number(payload.get("r_real"))),
        ("PnL USD", _number(payload.get("pnl_usd"))),
    ]
    for key, value in mapping:
        if value is not None:
            props[key] = value
    return props


def create_trade_journal_entry(
    payload: dict[str, Any],
    *,
    config: Settings | None = None,
) -> dict[str, Any]:
    """Create a Trade Journal Desk page (always create — one page per trade)."""
    cfg = _cfg(config)
    if not journal_configured(cfg):
        raise ProviderNotConfiguredError(
            "NOTION_API_KEY and NOTION_JOURNAL_DATABASE_ID must be set"
        )

    before_blocks: list[dict[str, Any]] = []
    after_blocks: list[dict[str, Any]] = []
    uploaded = 0
    failed_uploads = 0

    for shot in payload.get("screenshots_before") or []:
        label = str(shot.get("label") or "Before")
        file_id = _upload_image(
            cfg,
            filename=str(shot.get("filename") or f"{label}.jpg"),
            content_type=str(shot.get("content_type") or "image/jpeg"),
            data_base64=str(shot.get("data_base64") or ""),
        )
        if file_id:
            before_blocks.append(_image_block(file_id, label))
            uploaded += 1
        else:
            failed_uploads += 1
            before_blocks.append(_paragraph(f"[upload failed] {label}"))

    for shot in payload.get("screenshots_after") or []:
        label = str(shot.get("label") or "After")
        file_id = _upload_image(
            cfg,
            filename=str(shot.get("filename") or f"{label}.jpg"),
            content_type=str(shot.get("content_type") or "image/jpeg"),
            data_base64=str(shot.get("data_base64") or ""),
        )
        if file_id:
            after_blocks.append(_image_block(file_id, label))
            uploaded += 1
        else:
            failed_uploads += 1
            after_blocks.append(_paragraph(f"[upload failed] {label}"))

    children = _build_trade_children(
        thesis=str(payload.get("thesis") or ""),
        what_happened=str(payload.get("what_happened") or ""),
        lesson=str(payload.get("lesson") or ""),
        before_images=before_blocks,
        after_images=after_blocks,
    )
    properties = _trade_properties(payload)
    database_id = cfg.notion_journal_database_id.strip()

    with _client(cfg, version=NOTION_CRUD_VERSION) as client:
        response = client.post(
            "/v1/pages",
            json={
                "parent": {"database_id": database_id},
                "properties": properties,
                "children": children,
            },
        )
        raise_for_provider_response(response, provider="notion")
        page = response.json()

    page_id = str(page["id"])
    url = page.get("url") or ""
    logger.info(
        "notion_trade_created page_id=%s uploaded=%s failed=%s",
        page_id,
        uploaded,
        failed_uploads,
    )
    return {
        "action": "created",
        "page_id": page_id,
        "url": url,
        "date": str(payload.get("date") or ""),
        "images_uploaded": uploaded,
        "images_failed": failed_uploads,
    }

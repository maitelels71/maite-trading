"""Notion API — upsert Daily Review pages into a journal database."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import Settings, get_settings
from app.providers.exceptions import ProviderError, ProviderNotConfiguredError
from app.providers.http_utils import raise_for_provider_response

logger = logging.getLogger(__name__)

NOTION_API_BASE = "https://api.notion.com"
NOTION_VERSION = "2022-06-28"


def _cfg(config: Settings | None = None) -> Settings:
    return config or get_settings()


def notion_configured(config: Settings | None = None) -> bool:
    cfg = _cfg(config)
    return bool(cfg.notion_api_key.strip() and cfg.notion_database_id.strip())


def _client(cfg: Settings) -> httpx.Client:
    if not cfg.notion_api_key.strip():
        raise ProviderNotConfiguredError("NOTION_API_KEY is not set")
    return httpx.Client(
        base_url=NOTION_API_BASE,
        headers={
            "Authorization": f"Bearer {cfg.notion_api_key.strip()}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        timeout=30.0,
    )


def _rich_text(content: str, *, bold: bool = False) -> list[dict[str, Any]]:
    text = (content or "")[:1900]
    ann: dict[str, Any] = {"bold": True} if bold else {}
    return [{"type": "text", "text": {"content": text}, "annotations": ann}]


def _heading(text: str, level: int = 2) -> dict[str, Any]:
    key = f"heading_{level}"
    return {"object": "block", "type": key, key: {"rich_text": _rich_text(text)}}


def _paragraph(text: str) -> dict[str, Any]:
    return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {"rich_text": _rich_text(text)},
    }


def _todo(label: str, checked: bool) -> dict[str, Any]:
    return {
        "object": "block",
        "type": "to_do",
        "to_do": {"rich_text": _rich_text(label), "checked": checked},
    }


def _build_children(
    *,
    bias: str,
    notes: str,
    sections: list[dict[str, Any]],
    checked: dict[str, bool],
) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = [
        _paragraph(f"Bias: {bias.strip() or '—'}"),
    ]
    for section in sections:
        blocks.append(_heading(str(section.get("title") or "Section"), 3))
        for item in section.get("items") or []:
            item_id = str(item.get("id") or "")
            label = str(item.get("label") or item_id)
            blocks.append(_todo(label, bool(checked.get(item_id))))
    blocks.append(_heading("Notes", 3))
    note = (notes or "").strip() or "—"
    # Split long notes into paragraph chunks
    while note:
        blocks.append(_paragraph(note[:1900]))
        note = note[1900:]
    return blocks[:90]


def _page_properties(
    *,
    date: str,
    bias: str,
    done: int,
    total: int,
) -> dict[str, Any]:
    return {
        "Name": {
            "title": [{"type": "text", "text": {"content": f"Daily review — {date}"}}]
        },
        "Date": {"date": {"start": date}},
        "Bias": {"rich_text": _rich_text(bias.strip() or "—")},
        "Done": {"number": done},
        "Total": {"number": total},
    }


def _find_page_id_for_date(client: httpx.Client, database_id: str, date: str) -> str | None:
    response = client.post(
        f"/v1/databases/{database_id}/query",
        json={
            "filter": {"property": "Date", "date": {"equals": date}},
            "page_size": 1,
        },
    )
    raise_for_provider_response(response, provider="notion")
    results = response.json().get("results") or []
    if not results:
        return None
    return str(results[0]["id"])


def _list_block_ids(client: httpx.Client, page_id: str) -> list[str]:
    ids: list[str] = []
    cursor: str | None = None
    while True:
        params: dict[str, Any] = {"page_size": 100}
        if cursor:
            params["start_cursor"] = cursor
        response = client.get(f"/v1/blocks/{page_id}/children", params=params)
        raise_for_provider_response(response, provider="notion")
        payload = response.json()
        for block in payload.get("results") or []:
            ids.append(str(block["id"]))
        if not payload.get("has_more"):
            break
        cursor = payload.get("next_cursor")
    return ids


def _replace_children(
    client: httpx.Client, page_id: str, children: list[dict[str, Any]]
) -> None:
    for block_id in _list_block_ids(client, page_id):
        response = client.delete(f"/v1/blocks/{block_id}")
        raise_for_provider_response(response, provider="notion")
    if not children:
        return
    response = client.patch(
        f"/v1/blocks/{page_id}/children",
        json={"children": children},
    )
    raise_for_provider_response(response, provider="notion")


def upsert_daily_review(
    *,
    date: str,
    bias: str,
    notes: str,
    checked: dict[str, bool],
    sections: list[dict[str, Any]],
    config: Settings | None = None,
) -> dict[str, Any]:
    """Create or update the Notion page for a NY session date."""
    cfg = _cfg(config)
    if not notion_configured(cfg):
        raise ProviderNotConfiguredError(
            "NOTION_API_KEY and NOTION_DATABASE_ID must be set"
        )

    total = sum(len(s.get("items") or []) for s in sections)
    done = sum(
        1
        for s in sections
        for item in (s.get("items") or [])
        if checked.get(str(item.get("id") or ""))
    )
    children = _build_children(
        bias=bias, notes=notes, sections=sections, checked=checked
    )
    properties = _page_properties(date=date, bias=bias, done=done, total=total)
    database_id = cfg.notion_database_id.strip()

    with _client(cfg) as client:
        existing = _find_page_id_for_date(client, database_id, date)
        if existing:
            response = client.patch(
                f"/v1/pages/{existing}",
                json={"properties": properties},
            )
            raise_for_provider_response(response, provider="notion")
            page = response.json()
            _replace_children(client, existing, children)
            action = "updated"
            page_id = existing
        else:
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
            action = "created"
            page_id = str(page["id"])

    url = page.get("url") or ""
    logger.info("notion_daily_%s page_id=%s date=%s", action, page_id, date)
    return {
        "action": action,
        "page_id": page_id,
        "url": url,
        "date": date,
        "done": done,
        "total": total,
    }

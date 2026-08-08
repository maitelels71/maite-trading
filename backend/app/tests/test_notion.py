"""Notion daily upsert tests."""

from __future__ import annotations

import httpx

from app.core.config import Settings
from app.providers.notion import upsert_daily_review


def test_upsert_daily_review_creates_page() -> None:
    calls: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path))
        path = request.url.path
        if path.endswith("/databases/db-1/query"):
            return httpx.Response(200, json={"results": []})
        if path.endswith("/pages") and request.method == "POST":
            return httpx.Response(
                200,
                json={
                    "id": "page-new",
                    "url": "https://www.notion.so/page-new",
                },
            )
        return httpx.Response(500, json={"message": f"unexpected {path}"})

    transport = httpx.MockTransport(handler)
    cfg = Settings(
        _env_file=None,
        NOTION_API_KEY="secret_test",
        NOTION_DATABASE_ID="db-1",
    )  # type: ignore[call-arg]

    # Patch Client to use mock transport
    import app.providers.notion as notion_mod

    real_client = notion_mod.httpx.Client

    def client_factory(*args, **kwargs):
        kwargs["transport"] = transport
        kwargs.pop("base_url", None)
        return real_client(base_url="https://api.notion.com", *args, **kwargs)

    notion_mod.httpx.Client = client_factory  # type: ignore[misc]
    try:
        result = upsert_daily_review(
            date="2026-08-07",
            bias="Long NQ",
            notes="Good patience",
            checked={"po-bias": True},
            sections=[
                {
                    "id": "preopen",
                    "title": "Pre-open",
                    "items": [{"id": "po-bias", "label": "Wrote bias"}],
                }
            ],
            config=cfg,
        )
    finally:
        notion_mod.httpx.Client = real_client  # type: ignore[misc]

    assert result["action"] == "created"
    assert result["page_id"] == "page-new"
    assert result["done"] == 1
    assert result["total"] == 1
    assert ("POST", "/v1/databases/db-1/query") in calls
    assert ("POST", "/v1/pages") in calls


def test_upsert_daily_review_updates_existing() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/databases/db-1/query"):
            return httpx.Response(200, json={"results": [{"id": "page-old"}]})
        if path.endswith("/pages/page-old") and request.method == "PATCH":
            return httpx.Response(
                200,
                json={"id": "page-old", "url": "https://www.notion.so/page-old"},
            )
        if path.endswith("/blocks/page-old/children") and request.method == "GET":
            return httpx.Response(
                200,
                json={"results": [{"id": "block-1"}], "has_more": False},
            )
        if path.endswith("/blocks/block-1") and request.method == "DELETE":
            return httpx.Response(200, json={"id": "block-1"})
        if path.endswith("/blocks/page-old/children") and request.method == "PATCH":
            return httpx.Response(200, json={"results": []})
        return httpx.Response(500, json={"message": f"unexpected {request.method} {path}"})

    transport = httpx.MockTransport(handler)
    cfg = Settings(
        _env_file=None,
        NOTION_API_KEY="secret_test",
        NOTION_DATABASE_ID="db-1",
    )  # type: ignore[call-arg]

    import app.providers.notion as notion_mod

    real_client = notion_mod.httpx.Client

    def client_factory(*args, **kwargs):
        kwargs["transport"] = transport
        kwargs.pop("base_url", None)
        return real_client(base_url="https://api.notion.com", *args, **kwargs)

    notion_mod.httpx.Client = client_factory  # type: ignore[misc]
    try:
        result = upsert_daily_review(
            date="2026-08-07",
            bias="Flat",
            notes="",
            checked={},
            sections=[{"id": "s", "title": "S", "items": []}],
            config=cfg,
        )
    finally:
        notion_mod.httpx.Client = real_client  # type: ignore[misc]

    assert result["action"] == "updated"
    assert result["page_id"] == "page-old"

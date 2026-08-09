"""Trade journal Notion create tests."""

from __future__ import annotations

import base64
import json

import httpx

from app.core.config import Settings
from app.providers import notion_trade as trade_mod
from app.providers.notion_trade import _notion_date_start


def test_notion_date_start_includes_ny_timezone() -> None:
    assert _notion_date_start("2026-08-09") == {"date": {"start": "2026-08-09"}}
    assert _notion_date_start("2026-08-09T10:30") == {
        "date": {
            "start": "2026-08-09T10:30:00",
            "time_zone": "America/New_York",
        }
    }


def test_create_trade_journal_entry_without_images() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/pages" and request.method == "POST":
            captured["body"] = json.loads(request.content.decode())
            return httpx.Response(
                200,
                json={
                    "id": "trade-page",
                    "url": "https://www.notion.so/trade-page",
                },
            )
        return httpx.Response(500, json={"message": request.url.path})

    transport = httpx.MockTransport(handler)
    cfg = Settings(
        _env_file=None,
        NOTION_API_KEY="secret_test",
        NOTION_JOURNAL_DATABASE_ID="journal-db",
    )  # type: ignore[call-arg]

    real_client = trade_mod.httpx.Client

    def client_factory(*args, **kwargs):
        kwargs["transport"] = transport
        kwargs.pop("base_url", None)
        return real_client(base_url="https://api.notion.com", *args, **kwargs)

    trade_mod.httpx.Client = client_factory  # type: ignore[misc]
    try:
        result = trade_mod.create_trade_journal_entry(
            {
                "date": "2026-08-08T09:45",
                "activo": "NQ",
                "side": "Compra",
                "session": "NY AM",
                "playbook": "SBC",
                "tf_setup": "15m",
                "status": "Closed",
                "stuck_to_plan": "Yes",
                "entry": 21000.0,
                "sl": 20950.0,
                "tp": 21100.0,
                "thesis": "1H bullish continuation",
                "what_happened": "Took TP",
                "lesson": "Waited for zone",
            },
            config=cfg,
        )
    finally:
        trade_mod.httpx.Client = real_client  # type: ignore[misc]

    assert result["action"] == "created"
    assert result["page_id"] == "trade-page"
    assert result["images_uploaded"] == 0
    date_prop = captured["body"]["properties"]["Date"]["date"]
    assert date_prop["start"] == "2026-08-08T09:45:00"
    assert date_prop["time_zone"] == "America/New_York"

def test_create_trade_journal_uploads_image() -> None:
    calls: list[str] = []
    tiny = base64.b64encode(b"fake-jpeg-bytes").decode()

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        calls.append(f"{request.method} {path}")
        if path == "/v1/file_uploads" and request.method == "POST":
            return httpx.Response(200, json={"id": "fu-1"})
        if path == "/v1/file_uploads/fu-1/send":
            return httpx.Response(200, json={"id": "fu-1"})
        if path == "/v1/pages" and request.method == "POST":
            return httpx.Response(
                200,
                json={"id": "trade-page", "url": "https://www.notion.so/trade"},
            )
        return httpx.Response(500, json={"message": path})

    transport = httpx.MockTransport(handler)
    cfg = Settings(
        _env_file=None,
        NOTION_API_KEY="secret_test",
        NOTION_JOURNAL_DATABASE_ID="journal-db",
    )  # type: ignore[call-arg]

    real_client = trade_mod.httpx.Client

    def client_factory(*args, **kwargs):
        kwargs["transport"] = transport
        kwargs.pop("base_url", None)
        return real_client(base_url="https://api.notion.com", *args, **kwargs)

    trade_mod.httpx.Client = client_factory  # type: ignore[misc]
    try:
        result = trade_mod.create_trade_journal_entry(
            {
                "date": "2026-08-08",
                "activo": "NQ",
                "side": "Venta",
                "screenshots_before": [
                    {
                        "label": "Before 1H",
                        "filename": "before-1h.jpg",
                        "content_type": "image/jpeg",
                        "data_base64": tiny,
                    }
                ],
            },
            config=cfg,
        )
    finally:
        trade_mod.httpx.Client = real_client  # type: ignore[misc]

    assert result["images_uploaded"] == 1
    assert any("file_uploads" in c for c in calls)

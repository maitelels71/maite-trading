"""News briefing tests."""

from __future__ import annotations

from datetime import date

import httpx

from app.core.config import Settings
from app.services.news_briefing_service import NewsBriefingService


def test_news_briefing_checklist_without_key() -> None:
    cfg = Settings(_env_file=None, FINNHUB_API_KEY="")  # type: ignore[call-arg]
    briefing = NewsBriefingService(cfg).briefing(session_date=date(2026, 8, 4))
    assert briefing.configured is False
    assert briefing.provider == "none"
    assert len(briefing.aware_items) >= 1
    assert briefing.red_events == []


def test_news_briefing_with_finnhub_mock() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/calendar/economic"):
            return httpx.Response(
                200,
                json={
                    "economicCalendar": [
                        {
                            "country": "US",
                            "event": "CPI m/m",
                            "impact": "high",
                            "time": "2026-08-04 08:30:00",
                            "estimate": "0.2%",
                            "previous": "0.1%",
                        }
                    ]
                },
            )
        if path.endswith("/news"):
            return httpx.Response(
                200,
                json=[
                    {
                        "headline": "Fed officials signal patience on rate cuts",
                        "summary": "Powell and the Fed remain data dependent",
                        "source": "mock",
                        "url": "https://example.test/fed",
                        "datetime": 1722760000,
                        "related": "SPY",
                    }
                ],
            )
        if path.endswith("/company-news"):
            return httpx.Response(
                200,
                json=[
                    {
                        "headline": "AMZN issues guidance update",
                        "summary": "Company guidance revised",
                        "source": "mock",
                        "url": "https://example.test/amzn",
                        "datetime": 1722760000,
                        "related": "AMZN",
                    }
                ],
            )
        return httpx.Response(404, json={"error": path})

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport, base_url="https://finnhub.io/api/v1")
    cfg = Settings(_env_file=None, FINNHUB_API_KEY="test-key")  # type: ignore[call-arg]
    briefing = NewsBriefingService(cfg, client=client).briefing(session_date=date(2026, 8, 4))
    assert briefing.configured is True
    assert len(briefing.red_events) == 1
    assert briefing.red_events[0].event == "CPI m/m"
    assert any(i.impact in {"red", "orange"} for i in briefing.aware_items)


def test_news_briefing_calendar_403_still_loads_headlines() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/calendar/economic"):
            return httpx.Response(403, json={"error": "premium"})
        if request.url.path.endswith("/news"):
            return httpx.Response(
                200,
                json=[
                    {
                        "headline": "Fed holds rates steady",
                        "summary": "Policy unchanged",
                        "source": "mock",
                        "url": "https://example.test/fed2",
                        "datetime": 1722760000,
                        "related": "SPY",
                    }
                ],
            )
        if request.url.path.endswith("/company-news"):
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    client = httpx.Client(
        transport=httpx.MockTransport(handler),
        base_url="https://finnhub.io/api/v1",
    )
    cfg = Settings(_env_file=None, FINNHUB_API_KEY="test-key")  # type: ignore[call-arg]
    briefing = NewsBriefingService(cfg, client=client).briefing(session_date=date(2026, 8, 4))
    assert briefing.configured is True
    assert briefing.red_events == []
    assert len(briefing.market_items) == 1
    assert "calendar" in (briefing.message or "").lower()

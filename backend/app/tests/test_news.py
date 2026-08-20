"""News briefing tests."""

from __future__ import annotations

from datetime import date

import httpx
import pytest

from app.core.config import Settings
from app.services.news_briefing_service import NewsBriefingService


def test_news_briefing_checklist_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.services.news_briefing_service as news_mod

    monkeypatch.setattr(news_mod, "_FF_CACHE", None)

    def handler(request: httpx.Request) -> httpx.Response:
        if "faireconomy" in request.url.host:
            return httpx.Response(
                200,
                json=[
                    {
                        "title": "CPI m/m",
                        "country": "CAD",
                        "date": "2026-08-17T08:30:00-04:00",
                        "impact": "High",
                        "forecast": "",
                        "previous": "",
                    }
                ],
            )
        return httpx.Response(404)

    real_client = httpx.Client

    def client_factory(*args, **kwargs):
        kwargs = dict(kwargs)
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "Client", client_factory)
    cfg = Settings(_env_file=None, FINNHUB_API_KEY="")  # type: ignore[call-arg]
    briefing = NewsBriefingService(cfg).briefing(session_date=date(2026, 8, 20))
    assert briefing.configured is False
    assert len(briefing.aware_items) >= 1
    assert len(briefing.calendar_events) >= 1
    assert briefing.week_start is not None
    assert briefing.provider == "faireconomy"
    assert any(e.impact == "red" for e in briefing.calendar_events)


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
    assert briefing.red_events[0].currency == "USD"
    assert len(briefing.calendar_events) >= 1
    assert briefing.week_start is not None
    assert any(i.impact in {"red", "orange"} for i in briefing.aware_items)


def test_news_briefing_calendar_403_falls_back_to_faireconomy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        host = request.url.host
        path = request.url.path
        if "finnhub" in host and path.endswith("/calendar/economic"):
            return httpx.Response(403, json={"error": "premium"})
        if "finnhub" in host and path.endswith("/news"):
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
        if "finnhub" in host and path.endswith("/company-news"):
            return httpx.Response(200, json=[])
        if "faireconomy" in host and path.endswith("/ff_calendar_thisweek.json"):
            return httpx.Response(
                200,
                json=[
                    {
                        "title": "CPI m/m",
                        "country": "CAD",
                        "date": "2026-08-17T08:30:00-04:00",
                        "impact": "High",
                        "forecast": "0.1%",
                        "previous": "0.1%",
                    },
                    {
                        "title": "FOMC Meeting Minutes",
                        "country": "USD",
                        "date": "2026-08-19T14:00:00-04:00",
                        "impact": "High",
                        "forecast": "",
                        "previous": "",
                    },
                ],
            )
        if "econpulse" in host and path.endswith("/calendar"):
            return httpx.Response(200, json={"status": "ok", "events": []})
        return httpx.Response(404)

    real_client = httpx.Client

    def client_factory(*args, **kwargs):
        kwargs = dict(kwargs)
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "Client", client_factory)
    # Clear FF cache between tests
    import app.services.news_briefing_service as news_mod

    monkeypatch.setattr(news_mod, "_FF_CACHE", None)
    cfg = Settings(_env_file=None, FINNHUB_API_KEY="test-key")  # type: ignore[call-arg]
    briefing = NewsBriefingService(cfg).briefing(session_date=date(2026, 8, 20))
    assert briefing.configured is True
    assert "faireconomy" in briefing.provider
    red_names = {e.event for e in briefing.red_events}
    assert "CPI m/m" in red_names
    assert "FOMC Meeting Minutes" in red_names
    assert len(briefing.market_items) == 1

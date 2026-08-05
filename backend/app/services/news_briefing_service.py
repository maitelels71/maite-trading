"""Market news + economic calendar briefing (Finnhub when configured)."""

from __future__ import annotations

import hashlib
import re
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.core.config import Settings, settings
from app.core.logging import get_logger
from app.schemas.news_api import (
    EconomicEventOut,
    ImpactLevel,
    NewsBriefingResponse,
    NewsItemOut,
)

logger = get_logger(__name__)

WATCHLIST = ("SPY", "QQQ", "AMZN", "TSLA", "NVDA", "ES", "NQ")

AWARE_KEYWORDS = (
    "fed",
    "fomc",
    "powell",
    "cpi",
    "inflation",
    "payroll",
    "nonfarm",
    "nfp",
    "rate cut",
    "rate hike",
    "interest rate",
    "treasury",
    "recession",
    "tariff",
    "war",
    "geopolit",
    "sec ",
    "lawsuit",
    "guidance",
    "downgrade",
    "upgrade",
    "earnings",
    "layoffs",
    "bankruptcy",
    "halt",
    "circuit breaker",
)

FINNHUB_BASE = "https://finnhub.io/api/v1"


class NewsBriefingService:
    def __init__(self, config: Settings | None = None, *, client: httpx.Client | None = None) -> None:
        self._config = config or settings
        self._client = client

    def briefing(self, session_date: date | None = None) -> NewsBriefingResponse:
        tz = ZoneInfo(self._config.default_timezone or "America/New_York")
        day = session_date or datetime.now(tz).date()
        key = (self._config.finnhub_api_key or "").strip()

        if not key:
            return NewsBriefingResponse(
                as_of=datetime.now(UTC),
                session_date=day,
                provider="none",
                configured=False,
                message=(
                    "Add a free Finnhub API key (FINNHUB_API_KEY) to load live red-folder "
                    "economic events and headlines. Until then, use the awareness checklist below."
                ),
                aware_items=_static_awareness_checklist(day),
            )

        notes: list[str] = []
        red_events: list[EconomicEventOut] = []
        market: list[NewsItemOut] = []
        watchlist: list[NewsItemOut] = []

        try:
            red_events = self._economic_events(day, key)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {401, 403}:
                notes.append(
                    "Economic calendar unavailable on this Finnhub plan (403/401) — "
                    "headlines still load when allowed."
                )
            else:
                notes.append(f"Economic calendar error: {_safe_http_error(exc)}")
            logger.warning("Finnhub economic calendar failed: %s", _safe_http_error(exc))
        except Exception as exc:  # noqa: BLE001
            notes.append(f"Economic calendar error: {_safe_error(exc)}")
            logger.warning("Finnhub economic calendar failed", exc_info=True)

        try:
            market = self._market_news(key)
        except Exception as exc:  # noqa: BLE001
            notes.append(f"Market news error: {_safe_error(exc)}")
            logger.warning("Finnhub market news failed", exc_info=True)

        try:
            watchlist = self._watchlist_news(day, key)
        except Exception as exc:  # noqa: BLE001
            notes.append(f"Watchlist news error: {_safe_error(exc)}")
            logger.warning("Finnhub watchlist news failed", exc_info=True)

        if not market and not watchlist and not red_events:
            return NewsBriefingResponse(
                as_of=datetime.now(UTC),
                session_date=day,
                provider="finnhub",
                configured=True,
                message=" ".join(notes) or "Finnhub returned no news for this key/plan.",
                aware_items=_static_awareness_checklist(day),
            )

        aware = _pick_aware_items(market + watchlist)
        # Prefer unique headlines in aware
        seen: set[str] = set()
        aware_unique: list[NewsItemOut] = []
        for item in aware:
            if item.headline in seen:
                continue
            seen.add(item.headline)
            aware_unique.append(item)

        message = _summary_message(red_events, aware_unique)
        if notes:
            message = f"{message} ({'; '.join(notes)})"

        return NewsBriefingResponse(
            as_of=datetime.now(UTC),
            session_date=day,
            provider="finnhub",
            configured=True,
            message=message,
            red_events=red_events,
            aware_items=aware_unique[:20] or _static_awareness_checklist(day),
            watchlist_items=watchlist[:25],
            market_items=market[:25],
        )

    def _get_client(self, token: str) -> httpx.Client:
        if self._client is not None:
            return self._client
        return httpx.Client(
            base_url=FINNHUB_BASE,
            timeout=25.0,
            headers={"X-Finnhub-Token": token},
        )

    def _economic_events(self, day: date, token: str) -> list[EconomicEventOut]:
        client = self._get_client(token)
        owns = self._client is None
        try:
            res = client.get(
                "/calendar/economic",
                params={"from": day.isoformat(), "to": day.isoformat()},
            )
            res.raise_for_status()
            payload = res.json()
        finally:
            if owns and self._client is None:
                client.close()

        rows = payload.get("economicCalendar") if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            rows = []

        events: list[EconomicEventOut] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            impact = _map_finnhub_impact(row.get("impact"))
            if impact not in ("red", "orange"):
                continue
            country = str(row.get("country") or "")
            # Focus US + major for futures/equity desk
            if country and country.upper() not in {"US", "USA", "UNITED STATES", ""}:
                if impact != "red":
                    continue
            event_name = str(row.get("event") or row.get("title") or "Economic event")
            scheduled = _parse_finnhub_time(row.get("time") or row.get("date"))
            eid = _stable_id("econ", country, event_name, str(scheduled))
            events.append(
                EconomicEventOut(
                    id=eid,
                    country=country or "US",
                    event=event_name,
                    impact=impact,
                    scheduled_at=scheduled,
                    estimate=_str_or_none(row.get("estimate")),
                    previous=_str_or_none(row.get("prev") or row.get("previous")),
                    actual=_str_or_none(row.get("actual")),
                    reason="High-impact economic release — size down / avoid chasing ORB into the print",
                )
            )
        events.sort(key=lambda e: e.scheduled_at or datetime.min.replace(tzinfo=UTC))
        return events

    def _market_news(self, token: str) -> list[NewsItemOut]:
        client = self._get_client(token)
        owns = self._client is None
        try:
            res = client.get("/news", params={"category": "general"})
            res.raise_for_status()
            rows = res.json()
        finally:
            if owns and self._client is None:
                client.close()
        if not isinstance(rows, list):
            return []
        return [_news_from_finnhub(row, category="market") for row in rows if isinstance(row, dict)]

    def _watchlist_news(self, day: date, token: str) -> list[NewsItemOut]:
        client = self._get_client(token)
        owns = self._client is None
        items: list[NewsItemOut] = []
        start = (day - timedelta(days=1)).isoformat()
        end = day.isoformat()
        try:
            for symbol in ("SPY", "AMZN", "TSLA", "QQQ"):
                res = client.get(
                    "/company-news",
                    params={"symbol": symbol, "from": start, "to": end},
                )
                if res.status_code >= 400:
                    continue
                rows = res.json()
                if not isinstance(rows, list):
                    continue
                for row in rows[:8]:
                    if isinstance(row, dict):
                        item = _news_from_finnhub(row, category="watchlist", forced_symbol=symbol)
                        items.append(item)
        finally:
            if owns and self._client is None:
                client.close()
        return items


def _safe_error(exc: Exception) -> str:
    text = str(exc)
    return re.sub(r"token=[^&\s]+", "token=***", text)


def _safe_http_error(exc: httpx.HTTPStatusError) -> str:
    return f"HTTP {exc.response.status_code} on {exc.request.url.path}"


def _map_finnhub_impact(raw: Any) -> ImpactLevel:
    text = str(raw or "").strip().lower()
    if text in {"3", "high", "red"}:
        return "red"
    if text in {"2", "medium", "orange"}:
        return "orange"
    if text in {"1", "low", "yellow"}:
        return "yellow"
    return "info"


def _parse_finnhub_time(raw: Any) -> datetime | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return datetime.fromtimestamp(raw, tz=UTC)
    text = str(raw).strip()
    if not text:
        return None
    try:
        if text.isdigit():
            return datetime.fromtimestamp(int(text), tz=UTC)
        # Finnhub often returns "2026-08-04 08:30:00"
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ZoneInfo("America/New_York"))
        return dt.astimezone(UTC)
    except ValueError:
        return None


def _str_or_none(value: Any) -> str | None:
    if value is None or value == "":
        return None
    return str(value)


def _stable_id(*parts: str) -> str:
    blob = "|".join(parts)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:16]


def _news_from_finnhub(
    row: dict[str, Any],
    *,
    category: str,
    forced_symbol: str | None = None,
) -> NewsItemOut:
    headline = str(row.get("headline") or row.get("title") or "Untitled")
    summary = str(row.get("summary") or "")
    url = str(row.get("url") or "")
    source = str(row.get("source") or "finnhub")
    related = str(row.get("related") or "")
    symbols = [s for s in re.split(r"[,:\s]+", related) if s][:8]
    if forced_symbol and forced_symbol not in symbols:
        symbols = [forced_symbol, *symbols]
    published = _parse_finnhub_time(row.get("datetime") or row.get("date"))
    impact, reason = _classify_headline(headline, summary, symbols)
    return NewsItemOut(
        id=_stable_id(headline, url, str(published)),
        source=source,
        headline=headline,
        summary=summary[:400],
        url=url,
        published_at=published,
        symbols=symbols,
        impact=impact,
        reason=reason,
        category=category,
    )


def _classify_headline(
    headline: str,
    summary: str,
    symbols: list[str],
) -> tuple[ImpactLevel, str]:
    text = f"{headline} {summary}".lower()
    hits = [k for k in AWARE_KEYWORDS if k in text]
    watch_hits = [s for s in symbols if s.upper() in WATCHLIST]
    if hits and any(k in {"fed", "fomc", "cpi", "nfp", "nonfarm", "powell"} for k in hits):
        return "red", f"Macro keyword: {', '.join(hits[:3])}"
    if hits:
        return "orange", f"Worth monitoring: {', '.join(hits[:3])}"
    if watch_hits:
        return "yellow", f"Watchlist name: {', '.join(watch_hits[:3])}"
    return "info", ""


def _pick_aware_items(items: list[NewsItemOut]) -> list[NewsItemOut]:
    ranked = [i for i in items if i.impact in {"red", "orange", "yellow"}]
    ranked.sort(key=lambda i: {"red": 0, "orange": 1, "yellow": 2, "info": 3}[i.impact])
    return ranked


def _summary_message(
    red_events: list[EconomicEventOut],
    aware: list[NewsItemOut],
) -> str:
    if red_events:
        names = ", ".join(e.event for e in red_events[:3])
        return f"{len(red_events)} red-folder event(s) today — top: {names}"
    if aware:
        return f"No red econ prints flagged; {len(aware)} headline(s) to stay aware of"
    return "Quiet briefing — no high-impact flags in the current feed"


def _static_awareness_checklist(day: date) -> list[NewsItemOut]:
    """Shown when Finnhub is not configured — trading desk checklist."""
    base = datetime.combine(day, datetime.min.time(), tzinfo=UTC)
    checklist = [
        (
            "red",
            "Before the open: check CPI / PPI / NFP / FOMC on the economic calendar",
            "Red-folder macro prints can fake ORB breakouts in SPY/NQ/ES",
        ),
        (
            "orange",
            "AMZN / TSLA: scan for earnings, guidance, or major product headlines",
            "Single-name news can invalidate equities ORB on that ticker",
        ),
        (
            "orange",
            "Futures desk: note inventory (oil/gold) and Fed speakers overlapping RTH",
            "Avoid size into speeches if TradeAdvocate data is delayed",
        ),
        (
            "yellow",
            "If VIX or overnight futures gap is extreme, reduce ORB size",
            "Gap days often mean range is noisy — wait for confirmation",
        ),
    ]
    items: list[NewsItemOut] = []
    for impact, headline, reason in checklist:
        items.append(
            NewsItemOut(
                id=_stable_id("checklist", headline, day.isoformat()),
                source="maite-checklist",
                headline=headline,
                summary=reason,
                published_at=base,
                impact=impact,  # type: ignore[arg-type]
                reason=reason,
                category="checklist",
            )
        )
    return items

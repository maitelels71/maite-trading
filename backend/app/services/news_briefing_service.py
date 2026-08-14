"""Market news + economic calendar briefing (Finnhub when configured)."""

from __future__ import annotations

import hashlib
import os
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

WATCHLIST = ("SPY", "QQQ", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA", "NFLX", "ES", "NQ")

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
ECONPULSE_BASE = "https://api.econpulse.io/v1"

# Country / region codes from Finnhub → FX currency (Forex Factory style)
COUNTRY_TO_CCY: dict[str, str] = {
    "US": "USD",
    "USA": "USD",
    "UNITED STATES": "USD",
    "EU": "EUR",
    "EMU": "EUR",
    "EZ": "EUR",
    "EUROZONE": "EUR",
    "DE": "EUR",
    "FR": "EUR",
    "IT": "EUR",
    "ES": "EUR",
    "GB": "GBP",
    "UK": "GBP",
    "UNITED KINGDOM": "GBP",
    "JP": "JPY",
    "JAPAN": "JPY",
    "AU": "AUD",
    "AUSTRALIA": "AUD",
    "CA": "CAD",
    "CANADA": "CAD",
    "NZ": "NZD",
    "NEW ZEALAND": "NZD",
    "CH": "CHF",
    "SWITZERLAND": "CHF",
    "CN": "CNY",
    "CHINA": "CNY",
}

MAJOR_CCY = {"USD", "EUR", "GBP", "JPY", "AUD", "CAD", "NZD", "CHF", "CNY"}


def week_bounds_sunday(day: date) -> tuple[date, date]:
    """Forex Factory-style week: Sunday → Saturday containing `day`."""
    start = day - timedelta(days=(day.weekday() + 1) % 7)
    return start, start + timedelta(days=6)


def country_to_currency(country: str) -> str:
    key = (country or "").strip().upper()
    if key in COUNTRY_TO_CCY:
        return COUNTRY_TO_CCY[key]
    if len(key) == 3 and key.isalpha():
        return key
    return key[:3] if key else "—"



class NewsBriefingService:
    def __init__(self, config: Settings | None = None, *, client: httpx.Client | None = None) -> None:
        self._config = config or settings
        self._client = client

    def briefing(self, session_date: date | None = None) -> NewsBriefingResponse:
        tz = ZoneInfo(self._config.default_timezone or "America/New_York")
        day = session_date or datetime.now(tz).date()
        week_start, week_end = week_bounds_sunday(day)
        # Prefer live env (Lambda / secrets loader) over cached Settings singleton.
        key = (
            (os.getenv("FINNHUB_API_KEY") or "").strip()
            or (self._config.finnhub_api_key or "").strip()
        )

        if not key:
            calendar_events = self._econpulse_events(week_start, week_end) or _sample_week_calendar(
                week_start, week_end
            )
            return NewsBriefingResponse(
                as_of=datetime.now(UTC),
                session_date=day,
                week_start=week_start,
                week_end=week_end,
                provider="econpulse" if calendar_events else "none",
                configured=False,
                message=(
                    "No FINNHUB_API_KEY — calendar via EconPulse (US macro). "
                    "Add Finnhub for headlines + broader FX calendar when your plan allows."
                ),
                calendar_events=calendar_events,
                red_events=[e for e in calendar_events if e.impact == "red"],
                aware_items=_static_awareness_checklist(day),
            )

        notes: list[str] = []
        calendar_events: list[EconomicEventOut] = []
        calendar_provider = "finnhub"
        market: list[NewsItemOut] = []
        watchlist: list[NewsItemOut] = []

        try:
            calendar_events = self._economic_events(week_start, week_end, key)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {401, 403}:
                notes.append(
                    "Finnhub economic calendar blocked on this plan (403/401) — "
                    "using EconPulse US macro calendar instead; headlines still from Finnhub."
                )
            else:
                notes.append(f"Economic calendar error: {_safe_http_error(exc)}")
            logger.warning("Finnhub economic calendar failed: %s", _safe_http_error(exc))
        except Exception as exc:  # noqa: BLE001
            notes.append(f"Economic calendar error: {_safe_error(exc)}")
            logger.warning("Finnhub economic calendar failed", exc_info=True)

        if not calendar_events:
            try:
                calendar_events = self._econpulse_events(week_start, week_end)
                if calendar_events:
                    calendar_provider = "econpulse"
                    if not any("EconPulse" in n or "403" in n for n in notes):
                        notes.append("Calendar source: EconPulse (US macro).")
            except Exception as exc:  # noqa: BLE001
                notes.append(f"EconPulse calendar error: {_safe_error(exc)}")
                logger.warning("EconPulse calendar failed", exc_info=True)

        if not calendar_events:
            calendar_events = _sample_week_calendar(week_start, week_end)
            calendar_provider = "sample"
            notes.append("Showing sample calendar rows (no live calendar source available).")

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

        red_events = [e for e in calendar_events if e.impact == "red"]

        if not market and not watchlist and not calendar_events:
            return NewsBriefingResponse(
                as_of=datetime.now(UTC),
                session_date=day,
                week_start=week_start,
                week_end=week_end,
                provider="finnhub",
                configured=True,
                message=" ".join(notes) or "Finnhub returned no news for this key/plan.",
                aware_items=_static_awareness_checklist(day),
            )

        aware = _pick_aware_items(market + watchlist)
        seen: set[str] = set()
        aware_unique: list[NewsItemOut] = []
        for item in aware:
            if item.headline in seen:
                continue
            seen.add(item.headline)
            aware_unique.append(item)

        message = _summary_message(red_events, aware_unique, calendar_events)
        if notes:
            message = f"{message} ({'; '.join(notes)})"

        provider = (
            f"finnhub+{calendar_provider}"
            if calendar_provider != "finnhub"
            else "finnhub"
        )
        return NewsBriefingResponse(
            as_of=datetime.now(UTC),
            session_date=day,
            week_start=week_start,
            week_end=week_end,
            provider=provider,
            configured=True,
            message=message,
            calendar_events=calendar_events,
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

    def _economic_events(
        self,
        start: date,
        end: date,
        token: str,
    ) -> list[EconomicEventOut]:
        client = self._get_client(token)
        owns = self._client is None
        try:
            res = client.get(
                "/calendar/economic",
                params={"from": start.isoformat(), "to": end.isoformat()},
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
            country = str(row.get("country") or "")
            currency = country_to_currency(country)
            # Keep major FX + anything high-impact
            if currency not in MAJOR_CCY and impact not in ("red", "orange"):
                continue
            event_name = str(row.get("event") or row.get("title") or "Economic event")
            scheduled = _parse_finnhub_time(row.get("time") or row.get("date"))
            eid = _stable_id("econ", country, event_name, str(scheduled))
            reason = ""
            if impact == "red":
                reason = "High impact — size down / avoid chasing into the print"
            elif impact == "orange":
                reason = "Medium impact — watch spreads around the release"
            events.append(
                EconomicEventOut(
                    id=eid,
                    country=country or currency,
                    currency=currency,
                    event=event_name,
                    impact=impact,
                    scheduled_at=scheduled,
                    estimate=_str_or_none(row.get("estimate")),
                    previous=_str_or_none(row.get("prev") or row.get("previous")),
                    actual=_str_or_none(row.get("actual")),
                    reason=reason,
                )
            )
        events.sort(key=lambda e: e.scheduled_at or datetime.min.replace(tzinfo=UTC))
        return events

    def _econpulse_events(self, start: date, end: date) -> list[EconomicEventOut]:
        """US macro calendar fallback (works with key=demo on the free tier)."""
        key = (
            (os.getenv("ECONPULSE_API_KEY") or "").strip()
            or (self._config.econpulse_api_key or "").strip()
            or "demo"
        )
        with httpx.Client(base_url=ECONPULSE_BASE, timeout=20.0) as client:
            res = client.get("/calendar", params={"key": key})
            res.raise_for_status()
            payload = res.json()
        rows = payload.get("events") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            return []

        events: list[EconomicEventOut] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            day_raw = str(row.get("release_date") or "")[:10]
            if not day_raw:
                continue
            try:
                day = date.fromisoformat(day_raw)
            except ValueError:
                continue
            if day < start or day > end:
                continue
            impact = _map_econpulse_impact(row.get("importance"))
            name = str(row.get("name") or "US release")
            time_utc = str(row.get("release_time_utc") or "12:30:00")
            try:
                hh, mm, *rest = time_utc.split(":")
                scheduled = datetime(
                    day.year,
                    day.month,
                    day.day,
                    int(hh),
                    int(mm),
                    int(rest[0]) if rest else 0,
                    tzinfo=UTC,
                )
            except (TypeError, ValueError):
                scheduled = datetime(day.year, day.month, day.day, 12, 30, tzinfo=UTC)
            events.append(
                EconomicEventOut(
                    id=_stable_id("econpulse", str(row.get("event_id") or name), day_raw),
                    country="US",
                    currency="USD",
                    event=name,
                    impact=impact,
                    scheduled_at=scheduled,
                    estimate=_str_or_none(row.get("consensus")),
                    previous=_str_or_none(row.get("prior")),
                    actual=_str_or_none(row.get("actual")),
                    reason="US macro (EconPulse) — Finnhub FX calendar unavailable on free plan",
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


def _map_econpulse_impact(raw: Any) -> ImpactLevel:
    text = str(raw or "").strip().lower()
    if text in {"high", "red", "3"}:
        return "red"
    if text in {"medium", "med", "orange", "2"}:
        return "orange"
    if text in {"low", "yellow", "1"}:
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
    calendar: list[EconomicEventOut] | None = None,
) -> str:
    cal_n = len(calendar or [])
    if red_events:
        names = ", ".join(e.event for e in red_events[:3])
        return (
            f"{len(red_events)} high-impact · {cal_n} calendar events this week — top: {names}"
        )
    if cal_n:
        return f"{cal_n} calendar events this week · no high-impact flagged yet"
    if aware:
        return f"No red econ prints flagged; {len(aware)} headline(s) to stay aware of"
    return "Quiet briefing — no high-impact flags in the current feed"


def _sample_week_calendar(week_start: date, week_end: date) -> list[EconomicEventOut]:
    """Demo rows so the Forex Factory-style table is visible without a Finnhub key."""
    samples: list[tuple[int, str, str, ImpactLevel, str, str | None, str | None]] = [
        (0, "19:50", "JPY", "yellow", "Bank Lending y/y", None, "2.9%"),
        (0, "21:00", "CNY", "yellow", "Trade Balance", None, "114.77B"),
        (1, "04:30", "EUR", "yellow", "Sentix Investor Confidence", None, "-9.2"),
        (1, "08:30", "USD", "red", "CPI m/m", "0.2%", "0.1%"),
        (1, "10:00", "USD", "orange", "FOMC Member Speaks", None, None),
        (2, "02:30", "AUD", "red", "Cash Rate", "3.60%", "3.60%"),
        (2, "08:30", "USD", "orange", "Core PPI m/m", "0.2%", "0.1%"),
        (3, "08:30", "USD", "red", "Initial Jobless Claims", "225K", "218K"),
        (4, "08:30", "USD", "yellow", "Import Prices m/m", None, "0.1%"),
    ]
    out: list[EconomicEventOut] = []
    for offset, hm, ccy, impact, name, est, prev in samples:
        day = week_start + timedelta(days=offset)
        if day > week_end:
            continue
        hh, mm = hm.split(":")
        scheduled = datetime(
            day.year,
            day.month,
            day.day,
            int(hh),
            int(mm),
            tzinfo=ZoneInfo("America/New_York"),
        ).astimezone(UTC)
        out.append(
            EconomicEventOut(
                id=_stable_id("sample", day.isoformat(), name),
                country=ccy,
                currency=ccy,
                event=name,
                impact=impact,
                scheduled_at=scheduled,
                estimate=est,
                previous=prev,
                actual=None,
                reason="Sample row — connect Finnhub for live data",
            )
        )
    return out


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

"""News / economic calendar briefing schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


ImpactLevel = Literal["red", "orange", "yellow", "info"]


class NewsItemOut(BaseModel):
    id: str
    source: str
    headline: str
    summary: str = ""
    url: str = ""
    published_at: datetime | None = None
    symbols: list[str] = Field(default_factory=list)
    impact: ImpactLevel = "info"
    reason: str = ""
    category: str = "headline"


class EconomicEventOut(BaseModel):
    id: str
    country: str = ""
    currency: str = ""
    event: str
    impact: ImpactLevel
    scheduled_at: datetime | None = None
    estimate: str | None = None
    previous: str | None = None
    actual: str | None = None
    reason: str = ""


class NewsBriefingResponse(BaseModel):
    as_of: datetime
    session_date: date
    week_start: date | None = None
    week_end: date | None = None
    provider: str
    configured: bool
    message: str = ""
    calendar_events: list[EconomicEventOut] = Field(default_factory=list)
    red_events: list[EconomicEventOut] = Field(default_factory=list)
    aware_items: list[NewsItemOut] = Field(default_factory=list)
    watchlist_items: list[NewsItemOut] = Field(default_factory=list)
    market_items: list[NewsItemOut] = Field(default_factory=list)

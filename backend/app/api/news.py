"""News briefing endpoints — red-folder econ + awareness headlines."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from app.schemas.news_api import NewsBriefingResponse
from app.services.news_briefing_service import NewsBriefingService

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/briefing", response_model=NewsBriefingResponse)
def news_briefing(
    session_date: date | None = Query(
        default=None,
        description="NY session date (defaults to today America/New_York)",
    ),
) -> NewsBriefingResponse:
    return NewsBriefingService().briefing(session_date=session_date)

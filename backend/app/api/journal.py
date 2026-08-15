"""Trade journal → Notion sync."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.providers.exceptions import ProviderError, ProviderNotConfiguredError
from app.providers.notion_trade import create_trade_journal_entry, journal_configured

router = APIRouter(prefix="/journal", tags=["journal"])


class ScreenshotIn(BaseModel):
    label: str = Field(description="e.g. Before 1H / After 1m")
    filename: str = "shot.jpg"
    content_type: str = "image/jpeg"
    data_base64: str = Field(description="Base64 image bytes (no data: prefix)")


class TradeJournalIn(BaseModel):
    date: str = Field(
        description="NY session datetime YYYY-MM-DD or YYYY-MM-DDTHH:mm[:ss]"
    )
    title: str = ""
    activo: str = "MNQ"
    side: Literal["Compra", "Venta"] = "Compra"
    session: str = "NY AM"
    playbook: str = "SBC"
    tf_setup: str = "15m"
    status: str = "Closed"
    stuck_to_plan: str = "Yes"
    entry: float | None = None
    sl: float | None = None
    tp: float | None = None
    be: float | None = None
    r_planned: float | None = None
    r_real: float | None = None
    pnl_usd: float | None = None
    thesis: str = ""
    what_happened: str = ""
    lesson: str = ""
    screenshots_before: list[ScreenshotIn] = Field(default_factory=list)
    screenshots_after: list[ScreenshotIn] = Field(default_factory=list)


class TradeJournalOut(BaseModel):
    action: str
    page_id: str
    url: str
    date: str
    images_uploaded: int
    images_failed: int


class JournalStatusOut(BaseModel):
    configured: bool


@router.get("/notion/status", response_model=JournalStatusOut)
def journal_notion_status() -> JournalStatusOut:
    return JournalStatusOut(configured=journal_configured(settings))


@router.post("/notion", response_model=TradeJournalOut)
def save_trade_to_notion(payload: TradeJournalIn) -> TradeJournalOut:
    if len(payload.screenshots_before) > 3:
        raise HTTPException(status_code=400, detail="Max 3 before screenshots")
    if len(payload.screenshots_after) > 2:
        raise HTTPException(status_code=400, detail="Max 2 after screenshots")
    try:
        result = create_trade_journal_entry(
            payload.model_dump(),
            config=settings,
        )
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — surface decode/upload issues
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return TradeJournalOut(**result)

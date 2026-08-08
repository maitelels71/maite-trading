"""Daily review → Notion sync."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.providers.exceptions import ProviderError, ProviderNotConfiguredError
from app.providers.notion import notion_configured, upsert_daily_review

router = APIRouter(prefix="/daily", tags=["daily"])


class ChecklistItemIn(BaseModel):
    id: str
    label: str


class ChecklistSectionIn(BaseModel):
    id: str
    title: str
    items: list[ChecklistItemIn] = Field(default_factory=list)


class NotionDailyIn(BaseModel):
    date: str = Field(description="NY session date YYYY-MM-DD")
    bias: str = ""
    notes: str = ""
    checked: dict[str, bool] = Field(default_factory=dict)
    sections: list[ChecklistSectionIn] = Field(default_factory=list)


class NotionDailyOut(BaseModel):
    action: str
    page_id: str
    url: str
    date: str
    done: int
    total: int


class NotionStatusOut(BaseModel):
    configured: bool


@router.get("/notion/status", response_model=NotionStatusOut)
def notion_status() -> NotionStatusOut:
    return NotionStatusOut(configured=notion_configured(settings))


@router.post("/notion", response_model=NotionDailyOut)
def save_daily_to_notion(payload: NotionDailyIn) -> NotionDailyOut:
    sections: list[dict[str, Any]] = [
        s.model_dump() for s in payload.sections
    ]
    try:
        result = upsert_daily_review(
            date=payload.date,
            bias=payload.bias,
            notes=payload.notes,
            checked=payload.checked,
            sections=sections,
            config=settings,
        )
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return NotionDailyOut(**result)

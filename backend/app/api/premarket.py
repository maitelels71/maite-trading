"""Premarket evaluate endpoints — pre-open desk."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.premarket_api import (
    PremarketAlarmCheckRequest,
    PremarketAlarmCheckResponse,
    PremarketResultResponse,
    PremarketStartRequest,
)
from app.services import premarket_service

router = APIRouter(prefix="/premarket", tags=["premarket"])


@router.post("/evaluate/start", response_model=PremarketResultResponse)
def start_premarket_evaluate(
    body: PremarketStartRequest | None = None,
    db: Session = Depends(get_db),
) -> PremarketResultResponse:
    """Run a full-universe strategy scan and persist the Premarket run."""
    try:
        return premarket_service.start_premarket(body or PremarketStartRequest(), db=db)
    except HTTPException:
        raise
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/evaluate/result", response_model=PremarketResultResponse)
def get_premarket_evaluate_result(
    run_id: str | None = Query(default=None),
) -> PremarketResultResponse:
    """Load the latest Premarket run (or a specific run_id)."""
    result = premarket_service.get_premarket_result(run_id=run_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="No Premarket result yet. Run Start evaluate first.",
        )
    return result


@router.post("/alarm/check", response_model=PremarketAlarmCheckResponse)
def check_premarket_alarm(
    body: PremarketAlarmCheckRequest,
    db: Session = Depends(get_db),
) -> PremarketAlarmCheckResponse:
    """Check one symbol+strategy for Premarket alarm watches."""
    try:
        return premarket_service.check_alarm(body, db=db)
    except HTTPException:
        raise
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

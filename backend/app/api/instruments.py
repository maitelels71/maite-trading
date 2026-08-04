"""Instrument endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import Instrument
from app.schemas.common import InstrumentOut
from app.schemas.strategy_api import InstrumentListResponse

router = APIRouter(prefix="/instruments", tags=["instruments"])


@router.get("", response_model=InstrumentListResponse)
def list_instruments(db: Session = Depends(get_db)) -> InstrumentListResponse:
    rows = db.scalars(
        select(Instrument).where(Instrument.active.is_(True)).order_by(Instrument.symbol)
    ).all()
    return InstrumentListResponse(
        items=[
            InstrumentOut(
                symbol=r.symbol,
                name=r.name,
                market_type=r.market_type,  # type: ignore[arg-type]
                data_provider=r.data_provider,  # type: ignore[arg-type]
                active=r.active,
            )
            for r in rows
        ]
    )

"""Instruments endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import db_session
from app.models.instrument import Instrument
from app.schemas.common import InstrumentOut

router = APIRouter(prefix="/instruments", tags=["instruments"])


@router.get("", response_model=list[InstrumentOut])
def list_instruments(session: Session = Depends(db_session)) -> list[Instrument]:
    rows = list(session.scalars(select(Instrument).where(Instrument.is_active.is_(True)).order_by(Instrument.symbol)))
    return rows

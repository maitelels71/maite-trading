"""Instrument endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.storage import get_dynamo_store, using_dynamo
from app.database.session import get_db
from app.models import Instrument
from app.schemas.common import InstrumentOut
from app.schemas.strategy_api import InstrumentListResponse

router = APIRouter(prefix="/instruments", tags=["instruments"])


@router.get("", response_model=InstrumentListResponse)
def list_instruments(db: Session = Depends(get_db)) -> InstrumentListResponse:
    if using_dynamo():
        try:
            store = get_dynamo_store()
            store.seed_defaults()
            rows = store.list_instruments()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return InstrumentListResponse(
            items=[
                InstrumentOut(
                    symbol=r["symbol"],
                    name=r.get("name", ""),
                    market_type=r["market_type"],  # type: ignore[arg-type]
                    data_provider=r["data_provider"],  # type: ignore[arg-type]
                    active=bool(r.get("active", True)),
                )
                for r in rows
            ]
        )

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

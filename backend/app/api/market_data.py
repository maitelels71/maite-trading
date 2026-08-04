"""Market data sync + candle query endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.common import CandleOut
from app.schemas.strategy_api import MarketDataSyncRequest, MarketDataSyncResponse
from app.services.market_data_service import MarketDataService
from pydantic import BaseModel

router = APIRouter(prefix="/market-data", tags=["market-data"])


class CandleListResponse(BaseModel):
    ticker: str
    timeframe: str
    items: list[CandleOut]


@router.post("/sync", response_model=MarketDataSyncResponse)
def sync_market_data(
    body: MarketDataSyncRequest,
    db: Session = Depends(get_db),
) -> MarketDataSyncResponse:
    service = MarketDataService(db)
    try:
        candles = service.sync_historical_data(
            body.ticker,
            body.timeframe,
            body.start,
            body.end,
            market_type=body.market_type,
            force_refresh=body.force_refresh,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return MarketDataSyncResponse(
        ticker=body.ticker,
        timeframe=body.timeframe,
        candles_count=len(candles),
    )


@router.get("/candles", response_model=CandleListResponse)
def list_candles(
    ticker: str = Query(...),
    timeframe: str = Query("5m"),
    start: datetime = Query(...),
    end: datetime = Query(...),
    market_type: str | None = Query(None),
    db: Session = Depends(get_db),
) -> CandleListResponse:
    service = MarketDataService(db)
    try:
        instrument = service.get_instrument(ticker, market_type=market_type)
        candles = service.get_candles_by_range(
            instrument.id, timeframe, start, end
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return CandleListResponse(
        ticker=ticker,
        timeframe=timeframe,
        items=[
            CandleOut(
                timestamp=c.timestamp,
                open=c.open,
                high=c.high,
                low=c.low,
                close=c.close,
                volume=c.volume,
                ticker=c.ticker,
                timeframe=c.timeframe,
            )
            for c in candles
        ],
    )

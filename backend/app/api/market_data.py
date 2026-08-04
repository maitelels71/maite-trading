"""Market data sync endpoint."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import market_data_service
from app.schemas.common import MarketDataSyncRequest, MarketDataSyncResponse
from app.services.market_data_service import MarketDataService

router = APIRouter(prefix="/market-data", tags=["market-data"])


@router.post("/sync", response_model=MarketDataSyncResponse)
def sync_market_data(
    body: MarketDataSyncRequest,
    service: MarketDataService = Depends(market_data_service),
) -> MarketDataSyncResponse:
    if body.end <= body.start:
        raise HTTPException(status_code=400, detail="end must be after start")
    try:
        result = service.sync(
            body.symbol.upper(),
            body.timeframe,
            body.start,
            body.end,
            force_refresh=body.force_refresh,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return MarketDataSyncResponse(**result)

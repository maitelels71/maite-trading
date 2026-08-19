"""Market data sync + candle query endpoints."""

from datetime import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.storage import get_dynamo_store, using_dynamo
from app.database.session import get_db
from app.domain.enums import DataProviderName
from app.providers.factory import get_provider_factory
from app.schemas.common import CandleOut
from app.schemas.strategy_api import MarketDataSyncRequest, MarketDataSyncResponse
from app.services.market_data_service import MarketDataService, validate_candles

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/market-data", tags=["market-data"])


def should_fetch_provider_candles(
    *,
    force_refresh: bool,  # noqa: ARG001
    data_provider: str,  # noqa: ARG001
    cached_count: int,  # noqa: ARG001
) -> bool:
    """Options/futures candles are Yahoo-backed; always refresh when the desk syncs."""
    return True


class CandleListResponse(BaseModel):
    ticker: str
    timeframe: str
    items: list[CandleOut]


@router.post("/sync", response_model=MarketDataSyncResponse)
def sync_market_data(
    body: MarketDataSyncRequest,
    db: Session = Depends(get_db),
) -> MarketDataSyncResponse:
    if using_dynamo():
        try:
            store = get_dynamo_store()
            store.seed_defaults()
            instrument = store.get_instrument(body.ticker, market_type=body.market_type)
            cached = store.get_candles_by_range(
                instrument["symbol"],
                instrument["market_type"],
                body.timeframe,
                body.start,
                body.end,
            )
            provider_name = str(instrument.get("data_provider") or "")
            if should_fetch_provider_candles(
                force_refresh=body.force_refresh,
                data_provider=provider_name,
                cached_count=len(cached),
            ):
                provider = get_provider_factory().get(DataProviderName(provider_name))
                candles = provider.get_historical_candles(
                    body.ticker, body.timeframe, body.start, body.end
                )
                validate_candles(candles)
                store.save_candles(
                    instrument["symbol"],
                    instrument["market_type"],
                    body.timeframe,
                    candles,
                )
                count = len(candles)
            else:
                logger.info(
                    "Using %s cached candles for %s %s (Schwab fetch skipped)",
                    len(cached),
                    body.ticker,
                    body.timeframe,
                )
                count = len(cached)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return MarketDataSyncResponse(
            ticker=body.ticker,
            timeframe=body.timeframe,
            candles_count=count,
        )

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
    if using_dynamo():
        try:
            store = get_dynamo_store()
            instrument = store.get_instrument(ticker, market_type=market_type)
            candles = store.get_candles_by_range(
                instrument["symbol"],
                instrument["market_type"],
                timeframe,
                start,
                end,
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        service = MarketDataService(db)
        try:
            instrument_row = service.get_instrument(ticker, market_type=market_type)
            candles = service.get_candles_by_range(
                instrument_row.id, timeframe, start, end
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

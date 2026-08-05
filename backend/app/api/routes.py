from fastapi import APIRouter

from app.api.health import router as health_router
from app.api.instruments import router as instruments_router
from app.api.market_data import router as market_data_router
from app.api.news import router as news_router
from app.api.strategy import router as strategy_router
from app.api.strategy import strategies_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(instruments_router)
api_router.include_router(strategies_router)
api_router.include_router(strategy_router)
api_router.include_router(market_data_router)
api_router.include_router(news_router)

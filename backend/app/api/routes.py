from fastapi import APIRouter

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.broker import router as broker_router
from app.api.coinbase import router as coinbase_router
from app.api.daily import router as daily_router
from app.api.health import router as health_router
from app.api.instruments import router as instruments_router
from app.api.jobs import router as jobs_router
from app.api.journal import router as journal_router
from app.api.market_data import router as market_data_router
from app.api.news import router as news_router
from app.api.premarket import router as premarket_router
from app.api.strategy import router as strategy_router
from app.api.strategy import strategies_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(admin_router)
api_router.include_router(broker_router)
api_router.include_router(coinbase_router)
api_router.include_router(daily_router)
api_router.include_router(journal_router)
api_router.include_router(instruments_router)
api_router.include_router(strategies_router)
api_router.include_router(strategy_router)
api_router.include_router(market_data_router)
api_router.include_router(news_router)
api_router.include_router(premarket_router)
api_router.include_router(jobs_router)

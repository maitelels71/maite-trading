"""API router aggregation."""

from fastapi import APIRouter

from app.api import health, instruments, market_data, strategies

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(instruments.router)
api_router.include_router(strategies.router)
api_router.include_router(market_data.router)

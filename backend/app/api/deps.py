"""FastAPI dependency wiring for services (no business rules here)."""

from collections.abc import Generator
from functools import lru_cache

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.providers.factory import ProviderFactory, get_provider_factory
from app.services.market_data_service import MarketDataService
from app.services.strategy_engine import StrategyEngine
from app.strategies.registry import StrategyRegistry, get_strategy_registry


@lru_cache
def get_strategy_engine() -> StrategyEngine:
    return StrategyEngine(get_strategy_registry())


def get_market_data_service(db: Session = Depends(get_db)) -> MarketDataService:
    return MarketDataService(db, get_provider_factory())


def get_providers() -> ProviderFactory:
    return get_provider_factory()


def get_strategies() -> StrategyRegistry:
    return get_strategy_registry()

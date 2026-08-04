"""FastAPI dependencies."""

from __future__ import annotations

from collections.abc import Generator

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.providers.factory import ProviderFactory, get_provider_factory
from app.services.market_data_service import MarketDataService
from app.services.strategy_engine import StrategyEngine
from app.strategies.registry import StrategyRegistry, get_strategy_registry


def db_session(session: Session = Depends(get_db)) -> Session:
    return session


def provider_factory() -> ProviderFactory:
    return get_provider_factory()


def strategy_registry() -> StrategyRegistry:
    return get_strategy_registry()


def market_data_service(
    session: Session = Depends(db_session),
    factory: ProviderFactory = Depends(provider_factory),
) -> MarketDataService:
    return MarketDataService(session, provider_factory=factory)


def strategy_engine(
    session: Session = Depends(db_session),
    mds: MarketDataService = Depends(market_data_service),
    registry: StrategyRegistry = Depends(strategy_registry),
) -> StrategyEngine:
    return StrategyEngine(session, market_data=mds, registry=registry)

"""Instrument identity used across services (DB entity comes in Prompt 3)."""

from dataclasses import dataclass

from app.domain.enums import DataProviderName, MarketType


@dataclass(frozen=True, slots=True)
class InstrumentRef:
    symbol: str
    market_type: MarketType
    data_provider: DataProviderName
    name: str = ""
    exchange: str | None = None
    active: bool = True

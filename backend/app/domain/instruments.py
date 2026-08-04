"""Instrument domain helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List

from app.core.constants import MVP_EQUITIES, MVP_FUTURES, PROVIDER_SCHWAB, PROVIDER_TRADEADVOCATE
from app.domain.enums import AssetClass, ProviderName


@dataclass(frozen=True, slots=True)
class InstrumentSpec:
    symbol: str
    name: str
    asset_class: AssetClass
    provider: ProviderName
    exchange: str
    currency: str = "USD"
    tick_size: str = "0.01"
    contract_multiplier: str = "1"
    is_active: bool = True


def mvp_instrument_specs() -> List[InstrumentSpec]:
    futures_names = {
        "NQ": "E-mini Nasdaq-100",
        "ES": "E-mini S&P 500",
        "GC": "Gold Futures",
        "6E": "Euro FX Futures",
    }
    equity_names = {
        "AMZN": "Amazon.com Inc",
        "TSLA": "Tesla Inc",
        "SPY": "SPDR S&P 500 ETF",
        "QQQ": "Invesco QQQ Trust",
    }
    specs: List[InstrumentSpec] = []
    for symbol in MVP_FUTURES:
        specs.append(
            InstrumentSpec(
                symbol=symbol,
                name=futures_names[symbol],
                asset_class=AssetClass.FUTURE,
                provider=ProviderName.TRADEADVOCATE,
                exchange="CME",
                tick_size="0.25",
                contract_multiplier="20" if symbol in {"NQ", "ES"} else "1",
            )
        )
    for symbol in MVP_EQUITIES:
        asset = AssetClass.ETF if symbol in {"SPY", "QQQ"} else AssetClass.STOCK
        specs.append(
            InstrumentSpec(
                symbol=symbol,
                name=equity_names[symbol],
                asset_class=asset,
                provider=ProviderName.SCHWAB,
                exchange="NASDAQ" if symbol not in {"SPY", "QQQ"} else "ARCA",
            )
        )
    return specs


def provider_for_asset_class(asset_class: AssetClass) -> str:
    if asset_class == AssetClass.FUTURE:
        return PROVIDER_TRADEADVOCATE
    return PROVIDER_SCHWAB


def symbols_by_provider(specs: Iterable[InstrumentSpec]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for spec in specs:
        grouped.setdefault(spec.provider.value, []).append(spec.symbol)
    return grouped

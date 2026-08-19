"""Dynamo / Schwab sync should reuse cache unless force_refresh."""

from app.api.market_data import should_fetch_provider_candles
from app.domain.enums import DataProviderName


def test_schwab_skips_fetch_when_cached() -> None:
    assert (
        should_fetch_provider_candles(
            force_refresh=False,
            data_provider=DataProviderName.SCHWAB.value,
            cached_count=40,
        )
        is False
    )


def test_schwab_fetches_when_cache_empty() -> None:
    assert (
        should_fetch_provider_candles(
            force_refresh=False,
            data_provider=DataProviderName.SCHWAB.value,
            cached_count=0,
        )
        is True
    )


def test_schwab_force_refresh_fetches() -> None:
    assert (
        should_fetch_provider_candles(
            force_refresh=True,
            data_provider=DataProviderName.SCHWAB.value,
            cached_count=40,
        )
        is True
    )


def test_yahoo_fetches_even_with_cache() -> None:
    assert (
        should_fetch_provider_candles(
            force_refresh=False,
            data_provider=DataProviderName.TRADEADVOCATE.value,
            cached_count=40,
        )
        is True
    )

"""Dynamo candle sync always refreshes Yahoo-backed series."""

from app.api.market_data import should_fetch_provider_candles
from app.domain.enums import DataProviderName


def test_cached_schwab_named_instruments_still_fetch() -> None:
    assert (
        should_fetch_provider_candles(
            force_refresh=False,
            data_provider=DataProviderName.SCHWAB.value,
            cached_count=40,
        )
        is True
    )


def test_empty_cache_fetches() -> None:
    assert (
        should_fetch_provider_candles(
            force_refresh=False,
            data_provider=DataProviderName.SCHWAB.value,
            cached_count=0,
        )
        is True
    )


def test_yahoo_futures_fetches() -> None:
    assert (
        should_fetch_provider_candles(
            force_refresh=False,
            data_provider=DataProviderName.TRADEADVOCATE.value,
            cached_count=40,
        )
        is True
    )

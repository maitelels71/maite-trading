"""Provider normalization and HTTP adapter tests."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from app.core.config import Settings
from app.domain.candles import Candle
from app.domain.enums import DataProviderName
from app.providers.exceptions import ProviderNotConfiguredError, ProviderRateLimitError
from app.providers.mock import MockMarketDataProvider
from app.providers.normalize import normalize_candle, normalize_candles
from app.providers.schwab import SchwabProvider
from app.providers.tradeadvocate import TradeAdvocateProvider, schwab_futures_symbol


def test_normalize_ms_epoch_keeps_utc_tz() -> None:
    c = normalize_candle(
        {
            "datetime": 1_704_067_200_000,  # 2024-01-01 00:00:00 UTC
            "open": "10",
            "high": "12",
            "low": "9",
            "close": "11",
            "volume": "100",
        },
        ticker="SPY",
        timeframe="30m",
    )
    assert c.timestamp.tzinfo is not None
    from app.indicators.aggregate import aggregate_candles

    out = aggregate_candles([c], bucket_minutes=60, out_timeframe="1h")
    assert len(out) == 1
    assert out[0].timeframe == "1h"


def test_mock_provider_filters_range() -> None:
    provider = MockMarketDataProvider(
        {
            "SPY": [
                {
                    "timestamp": "2026-01-02T14:00:00",
                    "open": 1,
                    "high": 2,
                    "low": 1,
                    "close": 1.5,
                    "volume": 10,
                },
                {
                    "timestamp": "2026-01-02T15:00:00",
                    "open": 1.5,
                    "high": 2.5,
                    "low": 1.4,
                    "close": 2,
                    "volume": 11,
                },
            ]
        }
    )
    candles = provider.get_historical_candles(
        "SPY",
        "5m",
        datetime(2026, 1, 2, 14, 30),
        datetime(2026, 1, 2, 16, 0),
    )
    assert len(candles) == 1
    assert candles[0].close == Decimal("2")


def test_schwab_parses_pricehistory_with_mock_transport() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "pricehistory" in str(request.url)
        return httpx.Response(
            200,
            json={
                "candles": [
                    {
                        "datetime": 1735826400000,
                        "open": 100,
                        "high": 101,
                        "low": 99,
                        "close": 100.5,
                        "volume": 50,
                    }
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport, base_url="https://example.test")
    provider = SchwabProvider(
        Settings(),
        client=client,
        access_token="test-token",
    )
    candles = provider.get_historical_candles(
        "SPY",
        "5m",
        datetime(2026, 1, 2, tzinfo=UTC),
        datetime(2026, 1, 3, tzinfo=UTC),
    )
    assert len(candles) == 1
    assert candles[0].open == Decimal("100")


def test_schwab_futures_requests_extended_hours() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(200, json={"candles": []})

    client = httpx.Client(
        transport=httpx.MockTransport(handler),
        base_url="https://example.test",
    )
    provider = SchwabProvider(
        Settings(),
        client=client,
        access_token="test-token",
    )
    provider.get_historical_candles(
        "/MNQ",
        "5m",
        datetime(2026, 1, 2, tzinfo=UTC),
        datetime(2026, 1, 3, tzinfo=UTC),
    )
    assert "symbol=%2FMNQ" in seen["url"] or "symbol=/MNQ" in seen["url"]
    assert "needExtendedHoursData=true" in seen["url"]


def test_schwab_requires_credentials() -> None:
    provider = SchwabProvider(Settings(SCHWAB_CLIENT_ID="", SCHWAB_CLIENT_SECRET=""))
    with pytest.raises(ProviderNotConfiguredError):
        provider.authenticate()


def test_schwab_futures_symbol_maps_roots_and_contracts() -> None:
    assert schwab_futures_symbol("MNQ") == "/MNQ"
    assert schwab_futures_symbol("MNQU6") == "/MNQ"
    assert schwab_futures_symbol("MES") == "/MES"
    assert schwab_futures_symbol("MESU6") == "/MES"
    assert schwab_futures_symbol("NQ") == "/NQ"
    assert schwab_futures_symbol("NQU6") == "/NQ"
    assert schwab_futures_symbol("/ES") == "/ES"


def test_tradeadvocate_fetches_via_schwab_and_keeps_desk_ticker() -> None:
    captured: list[str] = []

    class _FakeSchwab:
        name = DataProviderName.SCHWAB

        def get_historical_candles(
            self,
            symbol: str,
            timeframe: str,
            start: datetime,
            end: datetime,
        ) -> list[Candle]:
            captured.append(symbol)
            return [
                Candle(
                    timestamp=datetime(2026, 1, 2, 15, 0, tzinfo=UTC),
                    open=Decimal("5000"),
                    high=Decimal("5005"),
                    low=Decimal("4995"),
                    close=Decimal("5001"),
                    volume=Decimal("12"),
                    ticker=symbol,
                    timeframe=timeframe,
                )
            ]

    provider = TradeAdvocateProvider(Settings(), schwab=_FakeSchwab())  # type: ignore[arg-type]
    candles = provider.get_historical_candles(
        "NQ",
        "5m",
        datetime(2026, 1, 1, tzinfo=UTC),
        datetime(2026, 1, 3, tzinfo=UTC),
    )
    assert captured == ["/NQ"]
    assert len(candles) == 1
    assert candles[0].close == Decimal("5001")
    assert candles[0].ticker == "NQ"


def test_tradeadvocate_rate_limit() -> None:
    class _RateLimitedSchwab:
        def get_historical_candles(self, *args: object, **kwargs: object) -> list[Candle]:
            raise ProviderRateLimitError("schwab 429")

    provider = TradeAdvocateProvider(
        Settings(), schwab=_RateLimitedSchwab()  # type: ignore[arg-type]
    )
    with pytest.raises(ProviderRateLimitError):
        provider.get_historical_candles(
            "ES",
            "5m",
            datetime(2026, 1, 1, tzinfo=UTC),
            datetime(2026, 1, 2, tzinfo=UTC),
        )


def test_normalize_sorts() -> None:
    rows = normalize_candles(
        [
            {
                "timestamp": "2026-01-02T16:00:00",
                "open": 2,
                "high": 3,
                "low": 1,
                "close": 2,
                "volume": 1,
            },
            {
                "timestamp": "2026-01-02T15:00:00",
                "open": 1,
                "high": 2,
                "low": 1,
                "close": 1.5,
                "volume": 1,
            },
        ],
        ticker="QQQ",
        timeframe="5m",
    )
    assert rows[0].timestamp < rows[1].timestamp

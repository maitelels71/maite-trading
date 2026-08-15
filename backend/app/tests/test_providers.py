"""Provider normalization and HTTP adapter tests."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from app.core.config import Settings
from app.providers.exceptions import ProviderNotConfiguredError, ProviderRateLimitError
from app.providers.mock import MockMarketDataProvider
from app.providers.normalize import normalize_candle, normalize_candles
from app.providers.schwab import SchwabProvider
from app.providers.tradeadvocate import TradeAdvocateProvider
from app.providers.yahoo import YahooProvider, extract_yahoo_candles, yahoo_futures_symbol


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


def test_yahoo_futures_symbol_maps_roots_and_contracts() -> None:
    assert yahoo_futures_symbol("MNQ") == "MNQ=F"
    assert yahoo_futures_symbol("MNQU6") == "MNQ=F"
    assert yahoo_futures_symbol("MES") == "MES=F"
    assert yahoo_futures_symbol("MESU6") == "MES=F"
    assert yahoo_futures_symbol("NQ") == "NQ=F"
    assert yahoo_futures_symbol("NQU6") == "NQ=F"
    assert yahoo_futures_symbol("/ES") == "ES=F"
    assert yahoo_futures_symbol("ES=F") == "ES=F"
    assert yahoo_futures_symbol("EURUSD") == "6E=F"
    assert yahoo_futures_symbol("GBPUSD") == "6B=F"
    assert yahoo_futures_symbol("AUDUSD") == "6A=F"
    assert yahoo_futures_symbol("GC") == "GC=F"
    assert yahoo_futures_symbol("GOLD") == "GC=F"


def test_yahoo_parses_chart_and_keeps_desk_ticker() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(
            200,
            json={
                "chart": {
                    "result": [
                        {
                            "timestamp": [1735826400],
                            "indicators": {
                                "quote": [
                                    {
                                        "open": [21000.0],
                                        "high": [21010.0],
                                        "low": [20990.0],
                                        "close": [21005.0],
                                        "volume": [120],
                                    }
                                ]
                            },
                        }
                    ],
                    "error": None,
                }
            },
        )

    client = httpx.Client(
        transport=httpx.MockTransport(handler),
        base_url="https://query1.finance.yahoo.com",
    )
    provider = TradeAdvocateProvider(
        Settings(), yahoo=YahooProvider(Settings(), client=client)
    )
    candles = provider.get_historical_candles(
        "NQ",
        "5m",
        datetime(2026, 1, 2, tzinfo=UTC),
        datetime(2026, 1, 3, tzinfo=UTC),
    )
    assert "NQ=F" in seen["url"]
    assert "interval=5m" in seen["url"]
    assert len(candles) == 1
    assert candles[0].close == Decimal("21005.0")
    assert candles[0].ticker == "NQ"


def test_yahoo_skips_null_bars() -> None:
    rows = extract_yahoo_candles(
        {
            "chart": {
                "result": [
                    {
                        "timestamp": [1, 2],
                        "indicators": {
                            "quote": [
                                {
                                    "open": [None, 10],
                                    "high": [None, 11],
                                    "low": [None, 9],
                                    "close": [None, 10.5],
                                    "volume": [None, 3],
                                }
                            ]
                        },
                    }
                ],
                "error": None,
            }
        }
    )
    assert len(rows) == 1
    assert rows[0]["close"] == 10.5


def test_tradeadvocate_rate_limit() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, text="too many")

    client = httpx.Client(
        transport=httpx.MockTransport(handler),
        base_url="https://query1.finance.yahoo.com",
    )
    provider = TradeAdvocateProvider(
        Settings(), yahoo=YahooProvider(Settings(), client=client)
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

"""Provider factory / normalize tests."""

from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.core.config import get_settings
from app.domain.enums import AssetClass
from app.providers.factory import ProviderFactory
from app.providers.mock import MockMarketDataProvider
from app.providers.normalize import normalize_candles
from app.providers.tradeadvocate_broker import TradeAdvocateBroker
from app.providers.exceptions import ProviderError
from app.ports.broker_execution import OrderRequest
from app.domain.enums import Side


def test_factory_uses_mock_when_configured():
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.use_mock_providers is True
    factory = ProviderFactory(settings=settings)
    p1 = factory.for_asset_class(AssetClass.FUTURE)
    p2 = factory.for_asset_class(AssetClass.STOCK)
    assert isinstance(p1, MockMarketDataProvider)
    assert isinstance(p2, MockMarketDataProvider)


def test_normalize_schwab_style_payload():
    rows = [
        {
            "datetime": 1_717_416_600_000,
            "open": 100,
            "high": 101,
            "low": 99.5,
            "close": 100.5,
            "volume": 10,
        }
    ]
    candles = normalize_candles(rows, symbol="SPY", timeframe="1m")
    assert len(candles) == 1
    assert candles[0].symbol == "SPY"
    assert candles[0].close == Decimal("100.5")
    assert candles[0].timestamp.tzinfo is not None


def test_normalize_tradeadvocate_aliases():
    rows = [
        {
            "t": "2024-06-03T13:30:00Z",
            "o": "5000.0",
            "h": "5001.0",
            "l": "4999.0",
            "c": "5000.5",
            "v": "12",
        }
    ]
    candles = normalize_candles(rows, symbol="ES")
    assert candles[0].open == Decimal("5000.0")
    assert candles[0].timestamp == datetime(2024, 6, 3, 13, 30, tzinfo=timezone.utc)


def test_mock_provider_returns_range():
    provider = MockMarketDataProvider()
    start = datetime(2024, 6, 3, 13, 30, tzinfo=timezone.utc)
    end = datetime(2024, 6, 3, 13, 35, tzinfo=timezone.utc)
    candles = provider.get_candles("NQ", "1m", start, end)
    assert len(candles) >= 5
    assert candles[0].timestamp <= candles[-1].timestamp


def test_tradeadvocate_broker_disabled_by_default():
    broker = TradeAdvocateBroker(enabled=False)
    with pytest.raises(ProviderError):
        broker.place_order(
            OrderRequest(symbol="NQ", side=Side.LONG, quantity=Decimal("1"))
        )

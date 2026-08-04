"""Market data service tests."""

from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.domain.candles import Candle
from app.services.market_data_service import MarketDataService


def test_upsert_and_cache(db_session):
    service = MarketDataService(db_session)
    instrument = service.get_instrument("SPY")
    et = ZoneInfo("America/New_York")
    start = datetime(2024, 6, 3, 9, 30, tzinfo=et)
    candles = [
        Candle(
            symbol="SPY",
            timestamp=start + timedelta(minutes=i),
            open=Decimal("100"),
            high=Decimal("101"),
            low=Decimal("99"),
            close=Decimal("100.5"),
            volume=Decimal("10"),
            timeframe="1m",
        )
        for i in range(3)
    ]
    count = service.upsert_candles(instrument.id, candles)
    assert count == 3
    cached = service.get_cached_candles(instrument.id, "1m", symbol="SPY")
    assert len(cached) == 3

    # Upsert again (idempotent conflict update)
    count2 = service.upsert_candles(instrument.id, candles)
    assert count2 >= 1
    cached2 = service.get_cached_candles(instrument.id, "1m", symbol="SPY")
    assert len(cached2) == 3


def test_sync_uses_mock_provider(db_session):
    service = MarketDataService(db_session)
    et = ZoneInfo("America/New_York")
    start = datetime(2024, 6, 3, 9, 30, tzinfo=et)
    end = datetime(2024, 6, 3, 10, 0, tzinfo=et)
    result = service.sync("ES", "1m", start, end, force_refresh=True)
    assert result["source"] == "provider"
    assert result["provider"] == "tradeadvocate"
    assert result["fetched"] > 0
    assert result["upserted"] > 0

    # Second call without force hits cache
    cached = service.sync("ES", "1m", start, end, force_refresh=False)
    assert cached["source"] == "cache"
    assert cached["cached"] > 0

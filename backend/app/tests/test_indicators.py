"""Unit tests for SMA / Bollinger helpers."""

from decimal import Decimal

from app.indicators import bollinger, sma
from app.indicators.aggregate import aggregate_candles
from app.domain.candles import Candle
from datetime import datetime
from zoneinfo import ZoneInfo


def test_sma_period_3() -> None:
    values = [Decimal(x) for x in ("1", "2", "3", "4", "5")]
    out = sma(values, 3)
    assert out[0] is None and out[1] is None
    assert out[2] == Decimal("2")
    assert out[3] == Decimal("3")
    assert out[4] == Decimal("4")


def test_bollinger_flat_series_zero_bandwidth() -> None:
    closes = [Decimal("100")] * 25
    bands = bollinger(closes, period=20, std_mult=2.0)
    assert bands[19].mid == Decimal("100")
    assert bands[19].upper == Decimal("100")
    assert bands[19].lower == Decimal("100")
    assert bands[19].bandwidth == Decimal("0")


def test_aggregate_30m_to_1h() -> None:
    # Two 30m bars in the same UTC hour
    a = Candle(
        timestamp=datetime(2026, 1, 5, 15, 0, tzinfo=ZoneInfo("UTC")),
        open=Decimal("10"),
        high=Decimal("12"),
        low=Decimal("9"),
        close=Decimal("11"),
        volume=Decimal("100"),
        ticker="SPY",
        timeframe="30m",
    )
    b = Candle(
        timestamp=datetime(2026, 1, 5, 15, 30, tzinfo=ZoneInfo("UTC")),
        open=Decimal("11"),
        high=Decimal("13"),
        low=Decimal("10"),
        close=Decimal("12"),
        volume=Decimal("50"),
        ticker="SPY",
        timeframe="30m",
    )
    out = aggregate_candles([a, b], bucket_minutes=60, out_timeframe="1h")
    assert len(out) == 1
    assert out[0].open == Decimal("10")
    assert out[0].high == Decimal("13")
    assert out[0].low == Decimal("9")
    assert out[0].close == Decimal("12")
    assert out[0].volume == Decimal("150")
    assert out[0].timeframe == "1h"


def test_aggregate_rth_hora_keeps_open_half_hour() -> None:
    """9:30–10:00 must stay as first Hora — not lost in a discarded 9:00 clock bucket."""
    from app.indicators.aggregate import aggregate_rth_hora

    et = ZoneInfo("America/New_York")
    day = datetime(2026, 1, 6, tzinfo=et)
    bars = [
        Candle(
            timestamp=day.replace(hour=9, minute=30),
            open=Decimal("100"),
            high=Decimal("101"),
            low=Decimal("99"),
            close=Decimal("100.5"),
            volume=Decimal("10"),
            ticker="TSLA",
            timeframe="30m",
        ),
        Candle(
            timestamp=day.replace(hour=10, minute=0),
            open=Decimal("100.5"),
            high=Decimal("102"),
            low=Decimal("100.4"),
            close=Decimal("101.5"),
            volume=Decimal("20"),
            ticker="TSLA",
            timeframe="30m",
        ),
        Candle(
            timestamp=day.replace(hour=10, minute=30),
            open=Decimal("101.5"),
            high=Decimal("103"),
            low=Decimal("101"),
            close=Decimal("102.5"),
            volume=Decimal("30"),
            ticker="TSLA",
            timeframe="30m",
        ),
    ]
    out = aggregate_rth_hora(bars)
    assert len(out) == 2
    assert out[0].timestamp.astimezone(et).hour == 9
    assert out[0].timestamp.astimezone(et).minute == 30
    assert out[0].open == Decimal("100")
    assert out[0].close == Decimal("100.5")
    assert out[1].timestamp.astimezone(et).hour == 10
    assert out[1].timestamp.astimezone(et).minute == 0
    assert out[1].open == Decimal("100.5")
    assert out[1].close == Decimal("102.5")
    assert out[1].volume == Decimal("50")

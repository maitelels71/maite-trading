"""Candle archive helpers + job run finalize."""

from __future__ import annotations

from datetime import UTC, date, datetime
from unittest.mock import MagicMock

from app.services.candle_archive import (
    JOB_BACKFILL,
    JOB_EOD,
    SyncUnitResult,
    _finalize,
    archive_instruments,
    run_backfill,
    run_eod_gaps,
    yahoo_max_days,
)


def test_yahoo_max_days_caps() -> None:
    assert yahoo_max_days("1m") == 7
    assert yahoo_max_days("15m") == 59
    assert yahoo_max_days("1h") >= 59


def test_archive_instruments_includes_futures_and_equity() -> None:
    rows = archive_instruments()
    symbols = {r["symbol"] for r in rows}
    assert "MNQ" in symbols
    assert "MGC" in symbols
    assert "SPY" in symbols


def test_finalize_partial_and_persists() -> None:
    store = MagicMock()
    units = [
        SyncUnitResult("MNQ", "future", "15m", bars=10),
        SyncUnitResult("MES", "future", "15m", bars=0, error="boom"),
    ]
    result = _finalize(
        job_name=JOB_EOD,
        trigger="manual",
        started_at="2026-08-20T00:00:00+00:00",
        units=units,
        store=store,
    )
    assert result.status == "partial"
    assert result.units_ok == 1
    assert result.units_err == 1
    assert result.bars_written == 10
    store.save_job_run.assert_called_once()
    record = store.save_job_run.call_args[0][0]
    assert record["job_name"] == JOB_EOD
    assert record["status"] == "partial"


def test_run_eod_gaps_uses_latest_and_saves(monkeypatch) -> None:
    store = MagicMock()
    store.seed_defaults = MagicMock()
    day = date(2026, 8, 20)
    latest = datetime(2026, 8, 19, 20, 0, tzinfo=UTC)
    store.latest_candle_timestamp.return_value = latest

    calls: list[tuple] = []

    def fake_fetch(store_arg, *, symbol, market_type, timeframe, start, end):
        calls.append((symbol, timeframe, start, end))
        return SyncUnitResult(symbol, market_type, timeframe, bars=3)

    monkeypatch.setattr(
        "app.services.candle_archive.archive_instruments",
        lambda: [{"symbol": "MNQ", "market_type": "future", "data_provider": "tradeadvocate"}],
    )
    monkeypatch.setattr("app.services.candle_archive._fetch_and_save", fake_fetch)
    monkeypatch.setattr("app.services.candle_archive._sleep_throttle", lambda *_a, **_k: None)

    result = run_eod_gaps(as_of=day, trigger="manual", store=store, throttle_sec=0)
    assert result.job_name == JOB_EOD
    assert result.status == "ok"
    assert result.bars_written == 3 * len(calls)
    assert all(c[0] == "MNQ" for c in calls)
    assert {c[1] for c in calls} == {"15m", "1h", "4h", "1m"}
    store.save_job_run.assert_called()


def test_run_backfill_caps_15m(monkeypatch) -> None:
    store = MagicMock()
    store.seed_defaults = MagicMock()
    seen_days: list[int] = []

    def fake_fetch(store_arg, *, symbol, market_type, timeframe, start, end):
        seen_days.append(int((end - start).total_seconds() // 86_400))
        return SyncUnitResult(symbol, market_type, timeframe, bars=1)

    monkeypatch.setattr(
        "app.services.candle_archive.archive_instruments",
        lambda: [{"symbol": "SPY", "market_type": "etf", "data_provider": "schwab"}],
    )
    monkeypatch.setattr("app.services.candle_archive._fetch_and_save", fake_fetch)
    monkeypatch.setattr("app.services.candle_archive._sleep_throttle", lambda *_a, **_k: None)

    result = run_backfill(
        lookback_days=200,
        timeframes=("15m",),
        trigger="manual",
        store=store,
        throttle_sec=0,
    )
    assert result.job_name == JOB_BACKFILL
    assert result.status == "ok"
    assert seen_days
    assert max(seen_days) <= 59

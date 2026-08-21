"""Accumulate Yahoo candles into Dynamo — EOD gaps + capped backfill."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from app.core.constants import MVP_INSTRUMENTS
from app.core.logging import get_logger
from app.domain.enums import MarketType
from app.providers.factory import get_provider_factory
from app.providers.yahoo import _MAX_LOOKBACK
from app.services.archive_store import ArchiveStore, get_archive_store
from app.services.market_data_service import validate_candles

logger = get_logger(__name__)

ET = ZoneInfo("America/New_York")

JOB_EOD = "candle_eod"
JOB_BACKFILL = "candle_backfill"

# Structure TFs for multi-week research; 1m only for live/recent entry.
EOD_TIMEFRAMES: tuple[str, ...] = ("15m", "1h", "4h", "1m")
BACKFILL_TIMEFRAMES: tuple[str, ...] = ("15m", "1h", "4h", "1d")

# Yahoo chart caps (see providers/yahoo.py). Keep backfill inside these.
YAHOO_TF_MAX_DAYS: dict[str, int] = {
    "1m": 7,
    "5m": 59,
    "15m": 59,
    "30m": 59,
    "1h": 365,
    "4h": 365,
    "1d": 730,
}

Trigger = Literal["schedule", "manual"]
JobStatus = Literal["ok", "partial", "error"]


@dataclass
class SyncUnitResult:
    symbol: str
    market_type: str
    timeframe: str
    bars: int = 0
    error: str | None = None


@dataclass
class ArchiveRunResult:
    job_name: str
    trigger: Trigger
    status: JobStatus
    started_at: str
    finished_at: str
    bars_written: int = 0
    units_ok: int = 0
    units_err: int = 0
    detail: list[dict[str, Any]] = field(default_factory=list)

    def to_record(self) -> dict[str, Any]:
        return {
            "job_name": self.job_name,
            "trigger": self.trigger,
            "status": self.status,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "summary": {
                "bars": self.bars_written,
                "units_ok": self.units_ok,
                "units_err": self.units_err,
            },
            "detail": self.detail[:40],
        }


def archive_instruments() -> list[dict[str, str]]:
    """MVP futures + equity/ETF book (active seeds)."""
    return [
        {
            "symbol": row["symbol"],
            "market_type": row["market_type"],
            "data_provider": row["data_provider"],
            "name": row.get("name") or row["symbol"],
        }
        for row in MVP_INSTRUMENTS
    ]


def yahoo_max_days(timeframe: str) -> int:
    if timeframe in YAHOO_TF_MAX_DAYS:
        return YAHOO_TF_MAX_DAYS[timeframe]
    # Fallback to provider interval caps when present
    interval = "60m" if timeframe in ("1h", "4h") else timeframe
    cap = _MAX_LOOKBACK.get(interval)
    if cap is not None:
        return max(1, int(cap.total_seconds() // 86_400))
    return 59


def _iso_now() -> str:
    return datetime.now(UTC).isoformat()


def _day_window_et(day: date) -> tuple[datetime, datetime]:
    start = datetime(day.year, day.month, day.day, 0, 0, tzinfo=ET).astimezone(UTC)
    end = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=ET).astimezone(UTC)
    return start, end


def _sleep_throttle(seconds: float = 0.35) -> None:
    if seconds > 0:
        time.sleep(seconds)


def _fetch_and_save(
    store: ArchiveStore,
    *,
    symbol: str,
    market_type: str,
    timeframe: str,
    start: datetime,
    end: datetime,
) -> SyncUnitResult:
    unit = SyncUnitResult(symbol=symbol, market_type=market_type, timeframe=timeframe)
    try:
        as_futures = market_type == MarketType.FUTURE.value
        provider_name = (
            "tradeadvocate" if as_futures else "schwab"
        )
        provider = get_provider_factory().get(provider_name)
        candles = provider.get_historical_candles(symbol, timeframe, start, end)
        validate_candles(candles)
        written = store.save_candles(symbol, market_type, timeframe, candles)
        unit.bars = written
    except Exception as exc:  # noqa: BLE001
        unit.error = str(exc)[:240]
        logger.warning(
            "archive sync failed %s %s %s: %s",
            symbol,
            timeframe,
            market_type,
            unit.error,
        )
    return unit


def _finalize(
    *,
    job_name: str,
    trigger: Trigger,
    started_at: str,
    units: list[SyncUnitResult],
    store: ArchiveStore | None,
) -> ArchiveRunResult:
    ok = [u for u in units if not u.error]
    err = [u for u in units if u.error]
    bars = sum(u.bars for u in ok)
    if not units:
        status: JobStatus = "error"
    elif err and ok:
        status = "partial"
    elif err:
        status = "error"
    else:
        status = "ok"
    result = ArchiveRunResult(
        job_name=job_name,
        trigger=trigger,
        status=status,
        started_at=started_at,
        finished_at=_iso_now(),
        bars_written=bars,
        units_ok=len(ok),
        units_err=len(err),
        detail=[
            {
                "symbol": u.symbol,
                "market_type": u.market_type,
                "timeframe": u.timeframe,
                "bars": u.bars,
                "error": u.error,
            }
            for u in units
            if u.error or u.bars
        ],
    )
    if store is not None:
        try:
            store.save_job_run(result.to_record())
        except Exception as exc:  # noqa: BLE001
            logger.error("failed to persist job run: %s", exc)
    return result


def run_eod_gaps(
    *,
    as_of: date | None = None,
    trigger: Trigger = "schedule",
    store: ArchiveStore | None = None,
    throttle_sec: float = 0.35,
) -> ArchiveRunResult:
    """Fill from last stored bar (or start of as_of day) through end of as_of."""
    store = store or get_archive_store()
    store.seed_defaults()
    day = as_of or datetime.now(ET).date()
    day_start, day_end = _day_window_et(day)
    started = _iso_now()
    units: list[SyncUnitResult] = []

    for inst in archive_instruments():
        symbol = inst["symbol"]
        market_type = inst["market_type"]
        for tf in EOD_TIMEFRAMES:
            latest = store.latest_candle_timestamp(symbol, market_type, tf)
            if latest is not None:
                # Resume just after last bar; clamp to Yahoo max window.
                start = latest + timedelta(seconds=1)
                max_start = day_end - timedelta(days=yahoo_max_days(tf))
                if start < max_start:
                    start = max_start
            else:
                start = day_start
                if tf == "1m":
                    start = max(start, day_end - timedelta(days=yahoo_max_days("1m")))
            if start >= day_end:
                units.append(
                    SyncUnitResult(
                        symbol=symbol,
                        market_type=market_type,
                        timeframe=tf,
                        bars=0,
                    )
                )
                continue
            unit = _fetch_and_save(
                store,
                symbol=symbol,
                market_type=market_type,
                timeframe=tf,
                start=start,
                end=day_end,
            )
            units.append(unit)
            _sleep_throttle(throttle_sec)

    return _finalize(
        job_name=JOB_EOD,
        trigger=trigger,
        started_at=started,
        units=units,
        store=store,
    )


def run_backfill(
    *,
    lookback_days: int | None = None,
    timeframes: tuple[str, ...] | None = None,
    trigger: Trigger = "manual",
    store: ArchiveStore | None = None,
    throttle_sec: float = 0.45,
) -> ArchiveRunResult:
    """Yahoo-capped historical pull for structure TFs (no long 1m)."""
    store = store or get_archive_store()
    store.seed_defaults()
    tfs = timeframes or BACKFILL_TIMEFRAMES
    end = datetime.now(UTC)
    started = _iso_now()
    units: list[SyncUnitResult] = []
    requested = int(lookback_days) if lookback_days is not None else 59

    for inst in archive_instruments():
        symbol = inst["symbol"]
        market_type = inst["market_type"]
        for tf in tfs:
            days = min(max(1, requested), yahoo_max_days(tf))
            start = end - timedelta(days=days)
            unit = _fetch_and_save(
                store,
                symbol=symbol,
                market_type=market_type,
                timeframe=tf,
                start=start,
                end=end,
            )
            units.append(unit)
            _sleep_throttle(throttle_sec)

    return _finalize(
        job_name=JOB_BACKFILL,
        trigger=trigger,
        started_at=started,
        units=units,
        store=store,
    )

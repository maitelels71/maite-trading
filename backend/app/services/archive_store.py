"""Archive persistence adapters — Dynamo (staging) or SQL+JSON (local)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.storage import get_dynamo_store, using_dynamo
from app.database.seed import seed_instruments
from app.models import Candle as CandleModel
from app.models import Instrument
from app.services.job_run_log import (
    append_job_run,
    latest_job_run as file_latest_job_run,
    list_job_runs as file_list_job_runs,
)
from app.services.market_data_service import MarketDataService


class ArchiveStore(Protocol):
    def seed_defaults(self) -> Any: ...

    def latest_candle_timestamp(
        self,
        symbol: str,
        market_type: str,
        timeframe: str,
    ) -> datetime | None: ...

    def save_candles(
        self,
        symbol: str,
        market_type: str,
        timeframe: str,
        candles: list,
    ) -> int: ...

    def save_job_run(self, record: dict[str, Any]) -> None: ...

    def list_job_runs(
        self,
        *,
        job_name: str | None = None,
        limit: int = 30,
    ) -> list[dict[str, Any]]: ...

    def latest_job_run(self, job_name: str) -> dict[str, Any] | None: ...


class SqlArchiveStore:
    """Local/dev: Postgres/SQLite candles + JSON job run log."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._svc = MarketDataService(session)

    def seed_defaults(self) -> dict[str, int]:
        n = seed_instruments(self._session)
        self._session.commit()
        return {"instruments": n}

    def latest_candle_timestamp(
        self,
        symbol: str,
        market_type: str,
        timeframe: str,
    ) -> datetime | None:
        inst = self._session.scalar(
            select(Instrument).where(
                Instrument.symbol == symbol,
                Instrument.market_type == market_type,
                Instrument.active.is_(True),
            )
        )
        if inst is None:
            return None
        return self._session.scalar(
            select(CandleModel.timestamp)
            .where(
                CandleModel.instrument_id == inst.id,
                CandleModel.timeframe == timeframe,
            )
            .order_by(CandleModel.timestamp.desc())
            .limit(1)
        )

    def save_candles(
        self,
        symbol: str,
        market_type: str,
        timeframe: str,
        candles: list,
    ) -> int:
        inst = self._svc.get_instrument(symbol, market_type=market_type)
        written = self._svc.save_candles(inst.id, timeframe, candles)
        self._session.commit()
        return written

    def save_job_run(self, record: dict[str, Any]) -> None:
        append_job_run(record)

    def list_job_runs(
        self,
        *,
        job_name: str | None = None,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        return file_list_job_runs(job_name=job_name, limit=limit)

    def latest_job_run(self, job_name: str) -> dict[str, Any] | None:
        return file_latest_job_run(job_name)


def get_archive_store(session: Session | None = None) -> ArchiveStore:
    if using_dynamo():
        return get_dynamo_store()
    if session is None:
        raise RuntimeError("SQL archive store requires a DB session")
    return SqlArchiveStore(session)


def archive_backend_label() -> str:
    return "dynamodb" if using_dynamo() else "sql+json"

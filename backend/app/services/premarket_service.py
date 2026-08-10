"""Premarket evaluate — batch scan + persisted run."""

from __future__ import annotations

from datetime import UTC, datetime
from threading import Lock
from typing import Any
from uuid import uuid4

from app.api.storage import get_dynamo_store, using_dynamo
from app.domain.session_calendar import resolve_operative_session_date
from app.schemas.premarket_api import (
    PremarketAlarmCheckRequest,
    PremarketAlarmCheckResponse,
    PremarketResultResponse,
    PremarketStartRequest,
    PremarketStrategyGroup,
)
from app.schemas.strategy_api import StrategyScanHit, StrategyScanRequest
from app.services import scan_service

_memory_lock = Lock()
_memory_latest: PremarketResultResponse | None = None
_memory_by_id: dict[str, PremarketResultResponse] = {}


def start_premarket(
    body: PremarketStartRequest,
    *,
    db: Any = None,
) -> PremarketResultResponse:
    started = datetime.now(UTC)
    session_day = body.session_date or resolve_operative_session_date()

    scan = scan_service.run_scan(
        StrategyScanRequest(
            strategies=body.strategies,
            timeframe=body.timeframe,
            session_date=session_day,
            data_provider=body.data_provider,
            symbols=body.symbols,
            matches_only=False,
        ),
        db=db,
    )

    groups = _group_by_strategy(scan.hits)
    best = [h for h in scan.hits if h.matched]
    finished = datetime.now(UTC)
    run_id = str(uuid4())

    result = PremarketResultResponse(
        run_id=run_id,
        status="completed",
        started_at=started,
        finished_at=finished,
        session_date=scan.session_date,
        timeframe=scan.timeframe,
        strategies_requested=scan.strategies,
        data_provider=body.data_provider,
        summary={
            "total_checked": scan.total_checked,
            "match_count": scan.match_count,
            "strategy_count": len(groups),
            "best_count": len(best),
        },
        strategy_groups=groups,
        best_results=best,
        hits=scan.hits,
    )
    _persist(result)
    return result


def check_alarm(
    body: PremarketAlarmCheckRequest,
    *,
    db: Any = None,
) -> PremarketAlarmCheckResponse:
    """One-symbol strategy check for Premarket alarm watches."""
    symbol = body.symbol.strip().upper()
    if not symbol:
        raise ValueError("symbol is required")

    scan = scan_service.run_scan(
        StrategyScanRequest(
            strategies=[body.strategy],
            timeframe=body.timeframe,
            session_date=body.session_date,
            data_provider=body.data_provider,
            symbols=[symbol],
            matches_only=False,
        ),
        db=db,
    )
    hit = next((h for h in scan.hits if h.symbol.upper() == symbol), None)
    if hit is None:
        return PremarketAlarmCheckResponse(
            symbol=symbol,
            strategy=body.strategy,
            timeframe=body.timeframe,
            session_date=scan.session_date,
            checked_at=datetime.now(UTC),
            met=False,
            status="no_data",
            detail=f"No scan row for {symbol}",
            hit=None,
        )
    return PremarketAlarmCheckResponse(
        symbol=hit.symbol,
        strategy=hit.strategy,
        timeframe=scan.timeframe,
        session_date=scan.session_date,
        checked_at=datetime.now(UTC),
        met=hit.matched,
        status=hit.status,
        detail=hit.detail,
        hit=hit,
    )


def get_premarket_result(run_id: str | None = None) -> PremarketResultResponse | None:
    if using_dynamo():
        store = get_dynamo_store()
        raw = store.get_premarket_run(run_id=run_id)
        if not raw:
            return None
        return PremarketResultResponse.model_validate(raw)

    with _memory_lock:
        if run_id:
            return _memory_by_id.get(run_id)
        return _memory_latest


def _group_by_strategy(hits: list[StrategyScanHit]) -> list[PremarketStrategyGroup]:
    by_name: dict[str, list[StrategyScanHit]] = {}
    for hit in hits:
        by_name.setdefault(hit.strategy, []).append(hit)
    groups: list[PremarketStrategyGroup] = []
    for strategy, rows in sorted(by_name.items()):
        groups.append(
            PremarketStrategyGroup(
                strategy=strategy,
                match_count=sum(1 for r in rows if r.matched),
                total=len(rows),
                tickers=rows,
            )
        )
    return groups


def _persist(result: PremarketResultResponse) -> None:
    payload = result.model_dump(mode="json")
    if using_dynamo():
        get_dynamo_store().save_premarket_run(payload)
        return
    with _memory_lock:
        global _memory_latest
        _memory_by_id[result.run_id] = result
        _memory_latest = result


def clear_memory_store() -> None:
    """Test helper."""
    with _memory_lock:
        global _memory_latest
        _memory_by_id.clear()
        _memory_latest = None

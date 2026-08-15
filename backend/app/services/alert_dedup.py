"""Dedup SMS fingerprints so the same setup is not re-texted every poll."""

from __future__ import annotations

from threading import Lock
from typing import Any

from app.api.storage import using_dynamo
from app.core.logging import get_logger

logger = get_logger(__name__)

_memory_lock = Lock()
_memory_sent: set[str] = set()


def clear_memory() -> None:
    with _memory_lock:
        _memory_sent.clear()


def claim_alert(fingerprint: str, *, payload: dict[str, Any] | None = None) -> bool:
    """True if this fingerprint is new and we should send."""
    fp = str(fingerprint or "").strip()
    if not fp:
        return False
    if using_dynamo():
        from app.api.storage import get_dynamo_store

        return get_dynamo_store().try_claim_alert(fp, payload or {})
    with _memory_lock:
        if fp in _memory_sent:
            return False
        _memory_sent.add(fp)
        return True

"""Directional confluence ranking (same rules as the Options desk TOP 5)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.constants import ALERT_TOP_N


def hit_side(hit: Any) -> str | None:
    """CALL/long or PUT/short from last_signal, else status text."""
    sig = getattr(hit, "last_signal", None)
    if sig is not None:
        side = getattr(sig, "side", None)
        if side is not None:
            val = side.value if hasattr(side, "value") else str(side)
            val = val.lower()
            if val in {"long", "short"}:
                return val
    status = str(getattr(hit, "status", "") or "").lower()
    if "long" in status or "call" in status:
        return "long"
    if "short" in status or "put" in status:
        return "short"
    return None


def is_ready_to_enter(hit: Any) -> bool:
    """Live entry — not a completed session or a watch-only row."""
    if not getattr(hit, "matched", False):
        return False
    status = str(getattr(hit, "status", "") or "")
    return status.startswith("signal_") or status.startswith("active_")


def _signal_ts(hit: Any) -> str:
    sig = getattr(hit, "last_signal", None)
    if sig is None:
        return ""
    ts = getattr(sig, "timestamp", "")
    return str(ts or "")


@dataclass
class ConfluenceGroup:
    symbol: str
    name: str
    side: str
    hits: list[Any] = field(default_factory=list)
    confluence: int = 0
    opposed_count: int = 0

    @property
    def strategies(self) -> tuple[str, ...]:
        return tuple(str(h.strategy) for h in self.hits)


def rank_by_confluence(
    hits: list[Any],
    *,
    top_n: int = ALERT_TOP_N,
    ready_only: bool = True,
) -> list[ConfluenceGroup]:
    """Keep the stronger CALL *or* PUT side per symbol; drop exact ties."""
    by_symbol: dict[str, list[Any]] = {}
    for hit in hits:
        if ready_only and not is_ready_to_enter(hit):
            continue
        if not ready_only and not getattr(hit, "matched", False):
            continue
        symbol = str(getattr(hit, "symbol", "") or "").upper()
        if not symbol:
            continue
        strategy = str(getattr(hit, "strategy", "") or "")
        existing = by_symbol.setdefault(symbol, [])
        if any(str(h.strategy) == strategy for h in existing):
            continue
        existing.append(hit)

    groups: list[ConfluenceGroup] = []
    for symbol, symbol_hits in by_symbol.items():
        calls = [h for h in symbol_hits if hit_side(h) == "long"]
        puts = [h for h in symbol_hits if hit_side(h) == "short"]
        if len(calls) > len(puts):
            side, keep, opposed = "long", calls, len(puts)
        elif len(puts) > len(calls):
            side, keep, opposed = "short", puts, len(calls)
        else:
            continue
        if not keep:
            continue
        sorted_hits = sorted(keep, key=_signal_ts)
        groups.append(
            ConfluenceGroup(
                symbol=symbol,
                name=str(getattr(symbol_hits[0], "name", None) or symbol),
                side=side,
                hits=sorted_hits,
                confluence=len(sorted_hits),
                opposed_count=opposed,
            )
        )

    groups.sort(
        key=lambda g: (-g.confluence, g.opposed_count, g.symbol),
    )
    return groups[:top_n]

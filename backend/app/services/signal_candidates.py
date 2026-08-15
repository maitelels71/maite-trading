"""Build ready-to-enter SMS candidates from scan hits."""

from __future__ import annotations

from dataclasses import dataclass

from app.core.constants import (
    ALERT_MIN_CONFLUENCE,
    ALERT_TOP_N,
    STRATEGY_SHORT_LABEL,
)
from app.domain.confluence import hit_side, is_ready_to_enter, rank_by_confluence
from app.domain.option_premiums import entry_premium_for_sizing
from app.providers.schwab_trader import size_long_option


@dataclass(frozen=True, slots=True)
class AlertCandidate:
    venue: str
    symbol: str
    side: str
    strategies: tuple[str, ...]
    confluence: int
    fingerprint: str
    contracts: int | None = None
    premium: float | None = None
    detail: str = ""

    @property
    def side_label(self) -> str:
        if self.venue == "options":
            return "CALL" if self.side == "long" else "PUT"
        return "LONG" if self.side == "long" else "SHORT"

    @property
    def strategy_labels(self) -> str:
        labels = [STRATEGY_SHORT_LABEL.get(s, s) for s in self.strategies]
        return "+".join(labels)


def _fingerprint(
    *,
    session: str,
    venue: str,
    symbol: str,
    side: str,
    strategies: tuple[str, ...],
) -> str:
    joined = ",".join(strategies)
    return f"{session}|{venue}|{symbol}|{side}|{joined}"


def options_candidates(
    hits: list,
    *,
    session: str,
    equity: float,
    cash_available: float,
    top_n: int = ALERT_TOP_N,
    min_confluence: int = ALERT_MIN_CONFLUENCE,
) -> list[AlertCandidate]:
    """TOP 5 by confluence, ≥2 agreeing playbooks, 1 contract fits 10% risk."""
    ranked = rank_by_confluence(hits, top_n=top_n, ready_only=True)
    out: list[AlertCandidate] = []
    for group in ranked:
        if group.confluence < min_confluence:
            continue
        premium = entry_premium_for_sizing(group.symbol)
        sizing = size_long_option(
            entry_premium=premium,
            equity=equity,
            cash_available=cash_available,
        )
        if not sizing["can_open"]:
            continue
        strategies = group.strategies
        out.append(
            AlertCandidate(
                venue="options",
                symbol=group.symbol,
                side=group.side,
                strategies=strategies,
                confluence=group.confluence,
                fingerprint=_fingerprint(
                    session=session,
                    venue="options",
                    symbol=group.symbol,
                    side=group.side,
                    strategies=strategies,
                ),
                contracts=int(sizing["contracts"]),
                premium=premium,
                detail=f"{group.confluence} conf · {int(sizing['contracts'])}ct @{premium:.2f}",
            )
        )
    return out


def futures_candidates(
    hits: list,
    *,
    session: str,
) -> list[AlertCandidate]:
    """Every ready-to-enter futures hit (no TOP5 / capital filter)."""
    out: list[AlertCandidate] = []
    seen: set[tuple[str, str, str]] = set()
    for hit in hits:
        if not is_ready_to_enter(hit):
            continue
        symbol = str(hit.symbol).upper()
        strategy = str(hit.strategy)
        side = hit_side(hit)
        if side not in {"long", "short"}:
            continue
        key = (symbol, side, strategy)
        if key in seen:
            continue
        seen.add(key)
        strategies = (strategy,)
        out.append(
            AlertCandidate(
                venue="futures",
                symbol=symbol,
                side=side,
                strategies=strategies,
                confluence=1,
                fingerprint=_fingerprint(
                    session=session,
                    venue="futures",
                    symbol=symbol,
                    side=side,
                    strategies=strategies,
                ),
                detail=str(getattr(hit, "detail", "") or ""),
            )
        )
    out.sort(key=lambda c: (c.symbol, c.side, c.strategy_labels))
    return out


def format_sms(candidate: AlertCandidate) -> str:
    prefix = "OPT" if candidate.venue == "options" else "FUT"
    core = (
        f"{prefix} {candidate.symbol} {candidate.side_label} · "
        f"{candidate.strategy_labels}"
    )
    if candidate.venue == "options" and candidate.contracts:
        core += f" · {candidate.confluence} conf · {candidate.contracts}ct"
    return core[:160]

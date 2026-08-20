"""Inverse-volatility crypto allocation + rebalance plan (broker-agnostic)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal
from statistics import pstdev

QUOTE_CASH = "CASH"


@dataclass(frozen=True, slots=True)
class PlannedOrder:
    product_id: str
    asset: str
    side: str  # BUY | SELL
    quote_size: Decimal | None
    base_size: Decimal | None
    notional: Decimal
    reason: str


def parse_asset_list(raw: str) -> tuple[str, ...]:
    assets = tuple(
        part.strip().upper()
        for part in (raw or "").split(",")
        if part.strip()
    )
    if not assets:
        raise ValueError("COINBASE_ASSETS must list at least one symbol")
    return assets


def daily_returns(closes: list[Decimal]) -> list[float]:
    out: list[float] = []
    for prev, cur in zip(closes, closes[1:]):
        if prev <= 0:
            continue
        out.append(float((cur - prev) / prev))
    return out


def inverse_volatility_weights(
    returns_by_asset: dict[str, list[float]],
    *,
    cash_pct: float = 0.10,
) -> dict[str, float]:
    """More weight to quieter assets. Reserves ``cash_pct`` in quote currency."""
    cash = min(max(cash_pct, 0.0), 0.95)
    risk_budget = 1.0 - cash
    inv: dict[str, float] = {}
    for asset, rets in returns_by_asset.items():
        if len(rets) < 2:
            continue
        vol = pstdev(rets)
        if vol <= 0:
            continue
        inv[asset] = 1.0 / vol
    if not inv:
        equal = risk_budget / max(len(returns_by_asset), 1)
        weights = {asset: equal for asset in returns_by_asset}
        weights[QUOTE_CASH] = cash
        return weights
    total_inv = sum(inv.values())
    weights = {asset: risk_budget * (val / total_inv) for asset, val in inv.items()}
    for asset in returns_by_asset:
        weights.setdefault(asset, 0.0)
    weights[QUOTE_CASH] = cash
    return weights


def _q(value: Decimal, places: str = "0.01") -> Decimal:
    return value.quantize(Decimal(places), rounding=ROUND_DOWN)


def _base_qty(notional: Decimal, price: Decimal) -> Decimal:
    if price <= 0:
        return Decimal("0")
    return (notional / price).quantize(Decimal("0.00000001"), rounding=ROUND_DOWN)


def plan_rebalance(
    *,
    holdings: dict[str, Decimal],
    prices: dict[str, Decimal],
    target_weights: dict[str, float],
    quote: str,
    min_trade: Decimal,
    max_trade: Decimal,
    threshold_pct: Decimal,
) -> list[PlannedOrder]:
    """Turn target weights into market BUY/SELL notionals.

    Sells are sized first so buys can reuse freed quote balance.
    """
    quote = quote.upper()
    values: dict[str, Decimal] = {}
    total = Decimal("0")
    for asset, qty in holdings.items():
        if asset == quote or asset == QUOTE_CASH:
            value = qty
        else:
            price = prices.get(asset, Decimal("0"))
            value = qty * price
        values[asset] = value
        total += value
    if total <= 0:
        return []

    threshold = total * (threshold_pct / Decimal("100"))
    cash_weight = Decimal(str(target_weights.get(QUOTE_CASH, 0.0)))
    cash_weight += Decimal(str(target_weights.get(quote, 0.0)))

    deltas: dict[str, Decimal] = {}
    for asset, price in prices.items():
        weight = Decimal(str(target_weights.get(asset, 0.0)))
        target = total * weight
        current = values.get(asset, Decimal("0"))
        deltas[asset] = target - current

    sells: list[PlannedOrder] = []
    freed = Decimal("0")
    for asset, delta in deltas.items():
        if delta >= 0:
            continue
        price = prices[asset]
        hold_value = values.get(asset, Decimal("0"))
        notional = min(-delta, hold_value, max_trade)
        if notional < min_trade or notional < threshold:
            continue
        notional = _q(notional)
        base_size = _base_qty(notional, price)
        if base_size <= 0:
            continue
        sells.append(
            PlannedOrder(
                product_id=f"{asset}-{quote}",
                asset=asset,
                side="SELL",
                quote_size=None,
                base_size=base_size,
                notional=notional,
                reason=f"rebalance {asset} toward {float(target_weights.get(asset, 0)):.1%}",
            )
        )
        freed += notional

    available_cash = values.get(quote, Decimal("0")) + values.get(QUOTE_CASH, Decimal("0"))
    available_cash += freed
    buys: list[PlannedOrder] = []
    for asset, delta in deltas.items():
        if delta <= 0:
            continue
        notional = min(delta, max_trade, available_cash)
        if notional < min_trade or notional < threshold:
            continue
        notional = _q(notional)
        if notional <= 0:
            continue
        buys.append(
            PlannedOrder(
                product_id=f"{asset}-{quote}",
                asset=asset,
                side="BUY",
                quote_size=notional,
                base_size=None,
                notional=notional,
                reason=f"rebalance {asset} toward {float(target_weights.get(asset, 0)):.1%}",
            )
        )
        available_cash -= notional

    return sells + buys

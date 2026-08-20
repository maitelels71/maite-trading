"""Run one Coinbase rebalance pass (Yahoo vol → plan → optional live orders)."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from app.core.config import Settings, settings
from app.core.logging import get_logger
from app.domain.crypto_alloc import (
    QUOTE_CASH,
    daily_returns,
    inverse_volatility_weights,
    parse_asset_list,
    plan_rebalance,
)
from app.providers.coinbase_trader import CoinbaseTrader
from app.providers.exceptions import ProviderError
from app.providers.yahoo import YahooProvider

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class BotRunResult:
    dry_run: bool
    quote: str
    weights: dict[str, float]
    holdings: dict[str, str]
    prices: dict[str, str]
    orders: list[dict[str, Any]]
    submissions: list[dict[str, Any]]
    error: str | None = None


def yahoo_crypto_symbol(asset: str) -> str:
    return f"{asset.upper()}-USD"


def _closes_from_yahoo(
    yahoo: YahooProvider,
    asset: str,
    *,
    lookback_days: int,
) -> list[Decimal]:
    end = datetime.now(UTC)
    start = end - timedelta(days=lookback_days + 5)
    candles = yahoo.get_historical_candles(
        yahoo_crypto_symbol(asset),
        "1d",
        start,
        end,
        desk_ticker=asset,
        as_futures=False,
    )
    return [c.close for c in candles]


def compute_weights(
    *,
    assets: tuple[str, ...],
    cash_pct: float,
    lookback_days: int,
    yahoo: YahooProvider | None = None,
) -> dict[str, float]:
    provider = yahoo or YahooProvider()
    returns_by_asset: dict[str, list[float]] = {}
    for asset in assets:
        closes = _closes_from_yahoo(provider, asset, lookback_days=lookback_days)
        rets = daily_returns(closes)
        if rets:
            returns_by_asset[asset] = rets
            continue
        logger.warning("coinbase-bot no yahoo returns for %s; equal-weight fallback", asset)
        returns_by_asset[asset] = []
    if not any(returns_by_asset.values()):
        equal = (1.0 - min(max(cash_pct, 0.0), 0.95)) / max(len(assets), 1)
        weights = {asset: equal for asset in assets}
        weights[QUOTE_CASH] = min(max(cash_pct, 0.0), 0.95)
        return weights
    return inverse_volatility_weights(returns_by_asset, cash_pct=cash_pct)


def _order_dict(order: PlannedOrder) -> dict[str, Any]:
    data = asdict(order)
    for key in ("quote_size", "base_size", "notional"):
        if data[key] is not None:
            data[key] = str(data[key])
    return data


def assert_live_allowed(config: Settings, *, confirm_live: bool) -> None:
    if not confirm_live:
        raise ProviderError("live trading requires --confirm-live")
    if config.coinbase_dry_run:
        raise ProviderError("COINBASE_DRY_RUN=true; set it to false for live orders")
    if not config.coinbase_trading_enabled:
        raise ProviderError("COINBASE_TRADING_ENABLED is false")


def run_rebalance(
    *,
    live: bool = False,
    confirm_live: bool = False,
    config: Settings | None = None,
    yahoo: YahooProvider | None = None,
    trader: CoinbaseTrader | None = None,
    strategy_only: bool = False,
) -> BotRunResult:
    cfg = config or settings
    assets = parse_asset_list(cfg.coinbase_assets)
    quote = (cfg.coinbase_quote or "USD").upper()
    weights = compute_weights(
        assets=assets,
        cash_pct=cfg.coinbase_cash_pct,
        lookback_days=cfg.coinbase_lookback_days,
        yahoo=yahoo,
    )
    if strategy_only:
        return BotRunResult(
            dry_run=True,
            quote=quote,
            weights=weights,
            holdings={},
            prices={},
            orders=[],
            submissions=[],
        )

    cb = trader or CoinbaseTrader(cfg)
    balances = cb.list_balances()
    product_ids = [f"{asset}-{quote}" for asset in assets]
    raw_prices = cb.product_prices(product_ids)
    prices: dict[str, Decimal] = {}
    for asset in assets:
        pid = f"{asset}-{quote}"
        price = raw_prices.get(pid, Decimal("0"))
        if price <= 0:
            raise ProviderError(f"no price for {pid}")
        prices[asset] = price

    holdings: dict[str, Decimal] = {quote: balances.get(quote, Decimal("0"))}
    if quote != "USDC" and holdings[quote] <= 0 and balances.get("USDC", Decimal("0")) > 0:
        # Spot accounts often park cash in USDC; treat it as quote if USD is empty.
        holdings[quote] = balances["USDC"]
    for asset in assets:
        holdings[asset] = balances.get(asset, Decimal("0"))

    orders = plan_rebalance(
        holdings=holdings,
        prices=prices,
        target_weights=weights,
        quote=quote,
        min_trade=Decimal(str(cfg.coinbase_min_trade_usd)),
        max_trade=Decimal(str(cfg.coinbase_max_trade_usd)),
        threshold_pct=Decimal(str(cfg.coinbase_rebalance_threshold_pct)),
    )

    submissions: list[dict[str, Any]] = []
    dry_run = not live
    if live:
        assert_live_allowed(cfg, confirm_live=confirm_live)
        dry_run = False
        for order in orders:
            submissions.append(cb.place_market(order))

    return BotRunResult(
        dry_run=dry_run,
        quote=quote,
        weights=weights,
        holdings={k: str(v) for k, v in holdings.items()},
        prices={k: str(v) for k, v in prices.items()},
        orders=[_order_dict(o) for o in orders],
        submissions=submissions,
    )

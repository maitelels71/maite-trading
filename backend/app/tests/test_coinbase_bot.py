"""Inverse-vol allocation + Coinbase rebalance bot tests (no live API)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.domain.candles import Candle
from app.domain.crypto_alloc import (
    QUOTE_CASH,
    inverse_volatility_weights,
    parse_asset_list,
    plan_rebalance,
)
from app.providers.coinbase_trader import (
    CoinbaseTrader,
    normalize_secret,
    resolve_key_file,
)
from app.providers.exceptions import ProviderError, ProviderNotConfiguredError
from app.services.coinbase_bot import assert_live_allowed, run_rebalance


def test_parse_asset_list() -> None:
    assert parse_asset_list("btc, eth") == ("BTC", "ETH")
    with pytest.raises(ValueError):
        parse_asset_list("  , ")


def test_inverse_vol_prefers_quieter_asset() -> None:
    weights = inverse_volatility_weights(
        {
            "BTC": [0.02, -0.02, 0.03, -0.01],
            "ETH": [0.08, -0.09, 0.10, -0.07],
        },
        cash_pct=0.10,
    )
    assert weights[QUOTE_CASH] == pytest.approx(0.10)
    assert weights["BTC"] > weights["ETH"]
    assert pytest.approx(sum(weights.values()), abs=1e-9) == 1.0


def test_plan_rebalance_sells_then_buys() -> None:
    orders = plan_rebalance(
        holdings={
            "USD": Decimal("200"),
            "BTC": Decimal("0.01"),
            "ETH": Decimal("0.5"),
        },
        prices={"BTC": Decimal("60000"), "ETH": Decimal("3000")},
        target_weights={"BTC": 0.45, "ETH": 0.45, QUOTE_CASH: 0.10},
        quote="USD",
        min_trade=Decimal("5"),
        max_trade=Decimal("25"),
        threshold_pct=Decimal("1"),
    )
    assert [o.side for o in orders] == ["SELL", "BUY"]
    assert orders[0].asset == "ETH"
    assert orders[0].base_size is not None
    assert orders[1].asset == "BTC"
    assert orders[1].quote_size == Decimal("25.00")
    assert all(o.notional <= Decimal("25") for o in orders)


def test_plan_rebalance_skips_inside_threshold() -> None:
    orders = plan_rebalance(
        holdings={"USD": Decimal("50"), "BTC": Decimal("1")},
        prices={"BTC": Decimal("100")},
        target_weights={"BTC": 0.67, QUOTE_CASH: 0.33},
        quote="USD",
        min_trade=Decimal("5"),
        max_trade=Decimal("50"),
        threshold_pct=Decimal("10"),
    )
    assert orders == []


def test_normalize_secret_unescapes_pem_newlines() -> None:
    raw = "-----BEGIN EC PRIVATE KEY-----\\nABC\\n-----END EC PRIVATE KEY-----"
    assert "\nABC\n" in normalize_secret(raw)


def test_resolve_key_file_repo_relative() -> None:
    path = resolve_key_file(".secrets/cdp_api_key.json")
    assert path.name == "cdp_api_key.json"
    assert "maite-trading" in str(path).replace("\\", "/").lower()


class _FakeYahoo:
    def get_historical_candles(self, symbol, timeframe, start, end, **kwargs):
        asset = kwargs.get("desk_ticker") or "BTC"
        base = Decimal("60000") if asset == "BTC" else Decimal("3000")
        start_ts = datetime(2024, 1, 1, tzinfo=UTC)
        candles = []
        for i in range(10):
            close = base + Decimal(i if asset == "BTC" else i * 20)
            candles.append(
                Candle(
                    timestamp=start_ts + timedelta(days=i),
                    open=close,
                    high=close,
                    low=close,
                    close=close,
                    volume=Decimal("1"),
                    ticker=asset,
                    timeframe="1d",
                )
            )
        return candles


class _FakeCoinbaseClient:
    def __init__(self) -> None:
        self.buys: list[dict] = []
        self.sells: list[dict] = []

    def get_accounts(self):
        return {
            "accounts": [
                {"currency": "USD", "available_balance": {"value": "200"}},
                {"currency": "BTC", "available_balance": {"value": "0.01"}},
                {"currency": "ETH", "available_balance": {"value": "0.5"}},
            ]
        }

    def get_product(self, product_id: str):
        prices = {"BTC-USD": "60000", "ETH-USD": "3000"}
        return {"price": prices[product_id]}

    def market_order_buy(self, **kwargs):
        self.buys.append(kwargs)
        return {"success": True, "success_response": {"order_id": "buy-1"}}

    def market_order_sell(self, **kwargs):
        self.sells.append(kwargs)
        return {"success": True, "success_response": {"order_id": "sell-1"}}


def _bot_settings(**kwargs) -> Settings:
    from app.core.config import settings as live

    payload = {
        "coinbase_api_key": "",
        "coinbase_api_secret": "",
        "coinbase_key_file": "",
        "coinbase_quote": "USD",
        "coinbase_assets": "BTC,ETH",
        "coinbase_cash_pct": 0.10,
        "coinbase_lookback_days": 30,
        "coinbase_max_trade_usd": 25.0,
        "coinbase_min_trade_usd": 5.0,
        "coinbase_rebalance_threshold_pct": 1.0,
        "coinbase_dry_run": True,
        "coinbase_trading_enabled": False,
    }
    payload.update(kwargs)
    return live.model_copy(update=payload)


def test_run_rebalance_dry_run_does_not_place_orders() -> None:
    client = _FakeCoinbaseClient()
    result = run_rebalance(
        live=False,
        config=_bot_settings(),
        yahoo=_FakeYahoo(),
        trader=CoinbaseTrader(client=client),
    )
    assert result.dry_run is True
    assert result.orders
    assert result.submissions == []
    assert client.buys == []
    assert client.sells == []


def test_run_rebalance_live_requires_flags() -> None:
    client = _FakeCoinbaseClient()
    with pytest.raises(ProviderError, match="confirm-live"):
        run_rebalance(
            live=True,
            confirm_live=False,
            config=_bot_settings(coinbase_dry_run=False, coinbase_trading_enabled=True),
            yahoo=_FakeYahoo(),
            trader=CoinbaseTrader(client=client),
        )
    assert client.buys == []


def test_run_rebalance_live_places_orders() -> None:
    client = _FakeCoinbaseClient()
    result = run_rebalance(
        live=True,
        confirm_live=True,
        config=_bot_settings(coinbase_dry_run=False, coinbase_trading_enabled=True),
        yahoo=_FakeYahoo(),
        trader=CoinbaseTrader(client=client),
    )
    assert result.dry_run is False
    assert result.submissions
    assert client.sells or client.buys


def test_assert_live_allowed() -> None:
    with pytest.raises(ProviderError):
        assert_live_allowed(_bot_settings(), confirm_live=True)
    with pytest.raises(ProviderError):
        assert_live_allowed(
            _bot_settings(coinbase_dry_run=False),
            confirm_live=True,
        )
    assert_live_allowed(
        _bot_settings(coinbase_dry_run=False, coinbase_trading_enabled=True),
        confirm_live=True,
    )


def test_trader_requires_credentials() -> None:
    trader = CoinbaseTrader(config=_bot_settings())
    with pytest.raises(ProviderNotConfiguredError):
        trader.list_balances()


def test_list_balances_sums_currency() -> None:
    client = SimpleNamespace(
        get_accounts=lambda: {
            "accounts": [
                {"currency": "USD", "available_balance": {"value": "10"}},
                {"currency": "USD", "available_balance": {"value": "5"}},
            ]
        }
    )
    assert CoinbaseTrader(client=client).list_balances()["USD"] == Decimal("15")

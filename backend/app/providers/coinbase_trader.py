"""Coinbase Advanced Trade adapter — accounts, prices, market orders."""

from __future__ import annotations

import uuid
from decimal import Decimal
from pathlib import Path
from typing import Any

from app.core.config import Settings, settings
from app.core.logging import get_logger
from app.domain.crypto_alloc import PlannedOrder
from app.providers.exceptions import ProviderError, ProviderNotConfiguredError

logger = get_logger(__name__)


def _as_dict(obj: Any) -> dict[str, Any]:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    to_dict = getattr(obj, "to_dict", None)
    if callable(to_dict):
        data = to_dict()
        return data if isinstance(data, dict) else {}
    return {}


def _dec(value: Any) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def _balance_value(account: dict[str, Any]) -> Decimal:
    bal = account.get("available_balance") or account.get("availableBalance") or {}
    if isinstance(bal, dict):
        return _dec(bal.get("value"))
    return _dec(bal)


def normalize_secret(raw: str) -> str:
    """Allow PEM pasted in .env with literal \\n sequences."""
    secret = (raw or "").strip()
    if "\\n" in secret and "\n" not in secret:
        secret = secret.replace("\\n", "\n")
    return secret


def resolve_key_file(raw: str) -> Path:
    """Resolve COINBASE_KEY_FILE from cwd or repo root (.secrets/)."""
    path = Path(raw)
    if path.is_absolute():
        return path
    if path.is_file():
        return path.resolve()
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / path


class CoinbaseTrader:
    """Thin wrapper around coinbase-advanced-py RESTClient (injectable for tests)."""

    def __init__(
        self,
        config: Settings | None = None,
        *,
        client: Any | None = None,
    ) -> None:
        self._config = config or settings
        self._client = client

    def _rest(self) -> Any:
        if self._client is not None:
            return self._client
        key_file = (self._config.coinbase_key_file or "").strip()
        api_key = (self._config.coinbase_api_key or "").strip()
        api_secret = normalize_secret(self._config.coinbase_api_secret)
        if not key_file and (not api_key or not api_secret):
            raise ProviderNotConfiguredError(
                "Set COINBASE_KEY_FILE or COINBASE_API_KEY + COINBASE_API_SECRET"
            )
        try:
            from coinbase.rest import RESTClient
        except ImportError as exc:
            raise ProviderNotConfiguredError(
                "Install coinbase-advanced-py (pip install -r requirements.txt)"
            ) from exc
        if key_file:
            resolved = resolve_key_file(key_file)
            if not resolved.is_file():
                raise ProviderNotConfiguredError(
                    f"COINBASE_KEY_FILE not found: {resolved}"
                )
            self._client = RESTClient(key_file=str(resolved))
        else:
            self._client = RESTClient(api_key=api_key, api_secret=api_secret)
        return self._client

    def list_balances(self) -> dict[str, Decimal]:
        try:
            payload = _as_dict(self._rest().get_accounts())
        except ProviderError:
            raise
        except Exception as exc:  # noqa: BLE001 — SDK raises HTTPError
            raise ProviderError(f"coinbase accounts: {exc}") from exc
        rows = payload.get("accounts") or []
        out: dict[str, Decimal] = {}
        for row in rows:
            account = _as_dict(row)
            currency = str(account.get("currency") or "").upper()
            if not currency:
                continue
            out[currency] = out.get(currency, Decimal("0")) + _balance_value(account)
        return out

    def product_prices(self, product_ids: list[str]) -> dict[str, Decimal]:
        prices: dict[str, Decimal] = {}
        client = self._rest()
        getter = getattr(client, "get_best_bid_ask", None)
        if callable(getter):
            payload = _as_dict(getter(product_ids=product_ids))
            books = payload.get("pricebooks") or payload.get("priceBooks") or []
            for book in books:
                row = _as_dict(book)
                pid = str(row.get("product_id") or row.get("productId") or "")
                bids = row.get("bids") or []
                asks = row.get("asks") or []
                bid = _as_dict(bids[0]) if bids else {}
                ask = _as_dict(asks[0]) if asks else {}
                mid = (_dec(bid.get("price")) + _dec(ask.get("price"))) / Decimal("2")
                if pid and mid > 0:
                    prices[pid] = mid
        for pid in product_ids:
            if pid in prices:
                continue
            product = _as_dict(client.get_product(pid))
            price = _dec(product.get("price"))
            if price > 0:
                prices[pid] = price
        return prices

    def place_market(self, order: PlannedOrder) -> dict[str, Any]:
        client_order_id = str(uuid.uuid4())
        client = self._rest()
        if order.side == "BUY":
            if order.quote_size is None or order.quote_size <= 0:
                raise ProviderError("BUY requires quote_size")
            raw = client.market_order_buy(
                client_order_id=client_order_id,
                product_id=order.product_id,
                quote_size=str(order.quote_size),
            )
        elif order.side == "SELL":
            if order.base_size is None or order.base_size <= 0:
                raise ProviderError("SELL requires base_size")
            raw = client.market_order_sell(
                client_order_id=client_order_id,
                product_id=order.product_id,
                base_size=str(order.base_size),
            )
        else:
            raise ProviderError(f"unsupported side {order.side}")
        result = _as_dict(raw)
        logger.info(
            "coinbase order side=%s product=%s success=%s",
            order.side,
            order.product_id,
            result.get("success"),
        )
        return result

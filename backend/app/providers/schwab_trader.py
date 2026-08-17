"""Schwab Trader API — accounts, positions, quotes, close orders."""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.core.config import Settings, settings
from app.core.logging import get_logger
from app.providers.exceptions import ProviderError, ProviderNotConfiguredError
from app.providers.http_utils import raise_for_provider_response
from app.providers.schwab_oauth import get_valid_access_token

logger = get_logger(__name__)

SCHWAB_TRADER_BASE = "https://api.schwabapi.com/trader/v1"
SCHWAB_MARKETDATA_BASE = "https://api.schwabapi.com/marketdata/v1"

_HASH_CACHE: tuple[float, list[dict[str, str]]] | None = None
_HASH_TTL_SEC = 300.0


def _retry_after_seconds(
    resp: httpx.Response, attempt: int, *, max_wait: float = 4.0
) -> float:
    raw = (resp.headers.get("Retry-After") or "").strip()
    cap = max(1.0, max_wait)
    if raw.isdigit():
        return min(float(raw), cap)
    return min(1.0 * (attempt + 1), cap)


class SchwabTrader:
    """Thin client for Schwab account/trading endpoints (same OAuth token as market data)."""

    def __init__(
        self,
        config: Settings | None = None,
        *,
        access_token: str | None = None,
    ) -> None:
        self._config = config or settings
        self._injected_token = access_token is not None
        self._access_token = access_token

    def _token(self) -> str:
        if self._injected_token and self._access_token:
            return self._access_token
        if not self._config.schwab_client_id or not self._config.schwab_client_secret:
            raise ProviderNotConfiguredError(
                "SCHWAB_CLIENT_ID and SCHWAB_CLIENT_SECRET must be set"
            )
        self._access_token = get_valid_access_token(self._config)
        return self._access_token

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token()}",
            "Accept": "application/json",
        }

    def _trader_request(
        self,
        method: str,
        url: str,
        *,
        timeout: float = 30.0,
        extra_headers: dict[str, str] | None = None,
        retries: int = 3,
        max_wait: float = 4.0,
        **kwargs: Any,
    ) -> httpx.Response:
        """GET/POST Schwab Trader with a short 429 backoff (API Gateway ~29s)."""
        headers = {**self._headers(), **(extra_headers or {})}
        last: httpx.Response | None = None
        for attempt in range(max(1, retries)):
            with httpx.Client(timeout=timeout) as client:
                last = client.request(method, url, headers=headers, **kwargs)
            if last.status_code != 429:
                return last
            wait = _retry_after_seconds(last, attempt, max_wait=max_wait)
            logger.warning(
                "schwab-trader 429 method=%s attempt=%s wait=%.1fs",
                method,
                attempt + 1,
                wait,
            )
            time.sleep(wait)
        assert last is not None
        raise_for_provider_response(last, provider="schwab-trader")
        return last

    def list_account_hashes(self, *, force: bool = False) -> list[dict[str, str]]:
        """Return [{accountNumber, hashValue}, ...]. Orders use hashValue as accountNumber path."""
        global _HASH_CACHE
        now = time.monotonic()
        if (
            not force
            and _HASH_CACHE is not None
            and now - _HASH_CACHE[0] < _HASH_TTL_SEC
        ):
            return _HASH_CACHE[1]
        resp = self._trader_request(
            "GET",
            f"{SCHWAB_TRADER_BASE}/accounts/accountNumbers",
            timeout=20.0,
        )
        raise_for_provider_response(resp, provider="schwab-trader")
        data = resp.json()
        if not isinstance(data, list):
            return []
        out: list[dict[str, str]] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            acct = str(row.get("accountNumber") or "")
            hv = str(row.get("hashValue") or "")
            if hv:
                out.append({"accountNumber": acct, "hashValue": hv})
        _HASH_CACHE = (now, out)
        return out

    def list_accounts_with_positions(self) -> list[dict[str, Any]]:
        resp = self._trader_request(
            "GET",
            f"{SCHWAB_TRADER_BASE}/accounts",
            timeout=30.0,
            params={"fields": "positions"},
        )
        raise_for_provider_response(resp, provider="schwab-trader")
        data = resp.json()
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]

    def get_quotes(self, symbols: list[str]) -> dict[str, dict[str, Any]]:
        clean = [s.strip().upper() for s in symbols if s and str(s).strip()]
        if not clean:
            return {}
        # Schwab quotes: comma-separated symbols
        joined = ",".join(dict.fromkeys(clean))
        resp = self._trader_request(
            "GET",
            f"{SCHWAB_MARKETDATA_BASE}/quotes",
            timeout=20.0,
            params={"symbols": joined},
        )
        raise_for_provider_response(resp, provider="schwab-quotes")
        data = resp.json()
        if not isinstance(data, dict):
            return {}
        return {str(k): v for k, v in data.items() if isinstance(v, dict)}

    def place_order(
        self,
        *,
        account_hash: str,
        symbol: str,
        quantity: float,
        asset_type: str,
        instruction: str,
        order_type: str = "MARKET",
        limit_price: float | None = None,
        duration: str = "DAY",
    ) -> dict[str, Any]:
        if not self._config.schwab_trading_enabled:
            raise ProviderError(
                "Live orders are disabled (SCHWAB_TRADING_ENABLED=false)"
            )
        if quantity <= 0:
            raise ProviderError("quantity must be > 0")
        instr = instruction.upper()
        allowed = {
            "SELL_TO_CLOSE",
            "BUY_TO_COVER",
            "SELL",
            "BUY",
            "BUY_TO_OPEN",
            "SELL_TO_OPEN",
        }
        if instr not in allowed:
            raise ProviderError(f"unsupported instruction: {instruction}")

        dur = duration.upper()
        if dur not in {"DAY", "GOOD_TILL_CANCEL", "FILL_OR_KILL"}:
            dur = "DAY"

        body: dict[str, Any] = {
            "orderType": order_type.upper(),
            "session": "NORMAL",
            "duration": dur,
            "orderStrategyType": "SINGLE",
            "orderLegCollection": [
                {
                    "instruction": instr,
                    "quantity": quantity,
                    "instrument": {
                        "symbol": symbol,
                        "assetType": asset_type.upper(),
                    },
                }
            ],
        }
        if order_type.upper() == "LIMIT":
            if limit_price is None or limit_price <= 0:
                raise ProviderError("limit_price required for LIMIT order")
            body["price"] = round(float(limit_price), 2)

        logger.info(
            "schwab_place_order account=%s symbol=%s qty=%s instr=%s type=%s px=%s dur=%s",
            account_hash[:8],
            symbol,
            quantity,
            instr,
            order_type,
            limit_price,
            dur,
        )
        resp = self._trader_request(
            "POST",
            f"{SCHWAB_TRADER_BASE}/accounts/{account_hash}/orders",
            timeout=30.0,
            extra_headers={"Content-Type": "application/json"},
            json=body,
            retries=3,
            max_wait=8.0,
        )
        if resp.status_code not in (200, 201):
            raise_for_provider_response(resp, provider="schwab-trader")
        order_id = ""
        loc = resp.headers.get("Location") or resp.headers.get("location") or ""
        if loc:
            order_id = loc.rstrip("/").split("/")[-1]
        try:
            payload = resp.json() if resp.content else {}
        except Exception:  # noqa: BLE001
            payload = {}
        if isinstance(payload, dict) and payload.get("orderId"):
            order_id = str(payload["orderId"])
        return {
            "order_id": order_id or None,
            "status": "submitted",
            "http_status": resp.status_code,
            "location": loc or None,
            "limit_price": limit_price,
            "quantity": quantity,
            "symbol": symbol,
        }

    def place_close_order(self, **kwargs: Any) -> dict[str, Any]:
        """Backward-compatible alias for close / cover orders."""
        return self.place_order(**kwargs)

    def list_orders(
        self,
        account_hash: str,
        *,
        max_results: int = 50,
    ) -> list[dict[str, Any]]:
        """Working + recent orders for one account (last ~7 days)."""
        from datetime import datetime, timedelta, timezone

        end = datetime.now(timezone.utc)
        start = end - timedelta(days=7)
        params: dict[str, Any] = {
            "fromEnteredTime": start.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "toEnteredTime": end.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "maxResults": max_results,
        }
        resp = self._trader_request(
            "GET",
            f"{SCHWAB_TRADER_BASE}/accounts/{account_hash}/orders",
            timeout=30.0,
            params=params,
        )
        raise_for_provider_response(resp, provider="schwab-trader")
        data = resp.json()
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]


def split_tp_ladder_quantities(quantity: float) -> list[tuple[float, int]]:
    """Scale-out qtys for 10% / 20% / 35%. Returns [(pct, qty), ...]."""
    qty = int(abs(quantity))
    if qty <= 0:
        return []
    if qty == 1:
        return [(35.0, 1)]
    if qty == 2:
        return [(20.0, 1), (35.0, 1)]
    base = qty // 3
    rem = qty % 3
    return [
        (10.0, base),
        (20.0, base),
        (35.0, base + rem),
    ]


DESK_RISK_PCT = 0.10  # consider / less-risk flag
MAX_OPEN_RISK_PCT = 0.50  # hard cap to send BUY_TO_OPEN


def build_occ_option_symbol(
    underlying: str,
    exp_iso: str,
    option_type: str,
    strike: float,
) -> str:
    """Schwab OCC: `AMZN  250815C00190000` (root padded to 6)."""
    root = str(underlying or "").strip().upper()
    if not root:
        raise ProviderError("underlying required for OCC symbol")
    root6 = root[:6].ljust(6)
    parts = str(exp_iso or "").strip().split("-")
    if len(parts) != 3:
        raise ProviderError(f"exp_iso must be YYYY-MM-DD, got {exp_iso!r}")
    y, m, d = parts
    if len(y) != 4:
        raise ProviderError(f"invalid exp year: {exp_iso!r}")
    yymmdd = f"{y[2:]}{m}{d}"
    cp = "C" if str(option_type).upper().startswith("C") else "P"
    if not (strike > 0):
        raise ProviderError("strike must be > 0")
    strike_int = int(round(float(strike) * 1000))
    return f"{root6}{yymmdd}{cp}{strike_int:08d}"


def size_long_option(
    *,
    entry_premium: float,
    equity: float,
    cash_available: float,
    risk_pct: float = DESK_RISK_PCT,
    max_open_risk_pct: float = MAX_OPEN_RISK_PCT,
) -> dict[str, Any]:
    """Size 1+ contracts: flag ≤10% equity; allow open up to 50% if cash covers."""
    prem = float(entry_premium or 0)
    eq = float(equity or 0)
    cash = float(cash_available or 0)
    cost_1 = round(prem * 100.0, 2) if prem > 0 else 0.0
    risk_budget = round(eq * risk_pct, 2) if eq > 0 else 0.0
    by_risk = int(risk_budget // cost_1) if cost_1 > 0 else 0
    by_cash = int(cash // cost_1) if cost_1 > 0 else 0
    can_pay_cash = cost_1 > 0 and cash >= cost_1
    consider = can_pay_cash and eq > 0 and cost_1 <= eq * risk_pct + 1e-9
    within_max = can_pay_cash and eq > 0 and cost_1 <= eq * max_open_risk_pct + 1e-9
    if consider:
        contracts = max(0, min(by_risk, by_cash))
    elif within_max:
        contracts = 1
    else:
        contracts = 0
    actual_risk_pct = round((cost_1 / eq) * 100, 1) if eq > 0 and cost_1 > 0 else 0.0
    equity_for_desk = round(cost_1 / risk_pct, 2) if cost_1 > 0 and risk_pct > 0 else 0.0
    equity_for_max = (
        round(cost_1 / max_open_risk_pct, 2)
        if cost_1 > 0 and max_open_risk_pct > 0
        else 0.0
    )
    cash_shortfall = round(max(0.0, cost_1 - cash), 2)
    return {
        "entry_premium": prem,
        "cost_per_contract": cost_1,
        "equity": eq,
        "cash_available": cash,
        "risk_pct": risk_pct,
        "risk_budget": risk_budget,
        "contracts": contracts,
        "can_open": contracts >= 1 and cost_1 > 0,
        "can_pay_cash": can_pay_cash,
        "consider": consider,
        "actual_risk_pct": actual_risk_pct,
        "equity_for_desk_rule": equity_for_desk,
        "equity_for_max_open": equity_for_max,
        "cash_shortfall": cash_shortfall,
    }


def normalize_account_summaries(
    accounts_payload: list[dict[str, Any]],
    account_hashes: list[dict[str, str]],
    *,
    risk_pct: float = DESK_RISK_PCT,
) -> list[dict[str, Any]]:
    """Flatten Schwab accounts into desk capital rows (equity + 10% risk)."""
    rows: list[dict[str, Any]] = []
    for block in accounts_payload:
        securities = block.get("securitiesAccount") or block
        if not isinstance(securities, dict):
            continue
        raw_acct = str(securities.get("accountNumber") or "")
        display_acct, account_hash = resolve_account_display(raw_acct, account_hashes)
        bal = securities.get("currentBalances") or securities.get("initialBalances") or {}
        if not isinstance(bal, dict):
            bal = {}
        equity_raw = (
            bal.get("liquidationValue")
            or bal.get("equity")
            or bal.get("accountValue")
            or bal.get("longMarketValue")
        )
        cash_raw = bal.get("cashBalance")
        available_raw = (
            bal.get("availableFunds")
            or bal.get("cashAvailableForTrading")
            or bal.get("buyingPower")
            or cash_raw
        )
        buying_raw = bal.get("buyingPower") or available_raw
        equity = float(equity_raw) if equity_raw is not None else 0.0
        cash = float(cash_raw) if cash_raw is not None else 0.0
        available = float(available_raw) if available_raw is not None else cash
        buying_power = float(buying_raw) if buying_raw is not None else available
        risk_budget = round(equity * risk_pct, 2) if equity > 0 else 0.0
        rows.append(
            {
                "accountNumber": display_acct,
                "hashValue": account_hash,
                "equity": round(equity, 2),
                "cash_balance": round(cash, 2),
                "available_funds": round(available, 2),
                "buying_power": round(buying_power, 2),
                "risk_pct": risk_pct,
                "risk_budget": risk_budget,
            }
        )
    # Prefer hash list order; fill missing accounts with zeros
    if not rows and account_hashes:
        for h in account_hashes:
            rows.append(
                {
                    "accountNumber": h.get("accountNumber"),
                    "hashValue": h.get("hashValue"),
                    "equity": 0.0,
                    "cash_balance": 0.0,
                    "available_funds": 0.0,
                    "buying_power": 0.0,
                    "risk_pct": risk_pct,
                    "risk_budget": 0.0,
                }
            )
    return rows


def normalize_order(
    row: dict[str, Any],
    account_hash: str,
    account_number: str = "",
) -> dict[str, Any] | None:
    legs = row.get("orderLegCollection") or []
    leg = legs[0] if isinstance(legs, list) and legs else {}
    if not isinstance(leg, dict):
        leg = {}
    inst = leg.get("instrument") or {}
    if not isinstance(inst, dict):
        inst = {}
    symbol = str(inst.get("symbol") or "").strip()
    if not symbol and not row.get("orderId"):
        return None
    status = str(row.get("status") or "")
    return {
        "account_hash": account_hash,
        "account_number": account_number or account_hash,
        "order_id": str(row.get("orderId") or ""),
        "status": status,
        "order_type": str(row.get("orderType") or ""),
        "duration": str(row.get("duration") or ""),
        "price": row.get("price"),
        "quantity": leg.get("quantity") or row.get("quantity"),
        "filled_quantity": row.get("filledQuantity"),
        "instruction": leg.get("instruction"),
        "symbol": symbol,
        "asset_type": inst.get("assetType"),
        "entered_time": row.get("enteredTime"),
    }


def resolve_account_display(
    raw_account_id: str,
    account_hashes: list[dict[str, str]],
) -> tuple[str, str]:
    """Return (display_account_number, account_hash)."""
    hash_by_acct = {
        row["accountNumber"]: row["hashValue"]
        for row in account_hashes
        if row.get("accountNumber") and row.get("hashValue")
    }
    acct_by_hash = {
        row["hashValue"]: row["accountNumber"]
        for row in account_hashes
        if row.get("accountNumber") and row.get("hashValue")
    }
    raw = str(raw_account_id or "")
    if raw in hash_by_acct:
        return raw, hash_by_acct[raw]
    if raw in acct_by_hash:
        return acct_by_hash[raw], raw
    return raw, raw


def normalize_positions(
    accounts_payload: list[dict[str, Any]],
    account_hashes: list[dict[str, str]],
) -> list[dict[str, Any]]:
    """Flatten Schwab account/position blobs into desk rows."""
    rows: list[dict[str, Any]] = []
    for block in accounts_payload:
        securities = block.get("securitiesAccount") or block
        if not isinstance(securities, dict):
            continue
        raw_acct = str(securities.get("accountNumber") or "")
        display_acct, account_hash = resolve_account_display(raw_acct, account_hashes)
        positions = securities.get("positions") or []
        if not isinstance(positions, list):
            continue
        for pos in positions:
            if not isinstance(pos, dict):
                continue
            inst = pos.get("instrument") or {}
            if not isinstance(inst, dict):
                continue
            symbol = str(inst.get("symbol") or "").strip()
            if not symbol:
                continue
            asset_type = str(inst.get("assetType") or "EQUITY").upper()
            long_qty = float(pos.get("longQuantity") or 0)
            short_qty = float(pos.get("shortQuantity") or 0)
            qty = long_qty if long_qty > 0 else -short_qty
            if qty == 0:
                continue
            avg = float(pos.get("averagePrice") or 0)
            market_value = float(pos.get("marketValue") or 0)
            day_pnl = pos.get("currentDayProfitLoss")
            day_pnl_pct = pos.get("currentDayProfitLossPercentage")
            multiplier = 100.0 if asset_type == "OPTION" else 1.0
            abs_qty = abs(qty)
            mark = None
            if abs_qty > 0 and market_value:
                mark = abs(market_value) / (abs_qty * multiplier)
            pnl_pct = None
            if avg > 0 and mark is not None:
                # Long premium/stock: (mark - avg) / avg
                # Short: inverse
                if qty > 0:
                    pnl_pct = ((mark - avg) / avg) * 100.0
                else:
                    pnl_pct = ((avg - mark) / avg) * 100.0

            underlying = str(
                inst.get("underlyingSymbol")
                or (symbol.split()[0] if " " in symbol else symbol[: symbol.find("2")] if asset_type == "OPTION" else symbol)
            )
            # Option OCC often like AMZN  250815C00190000 — take leading letters
            if asset_type == "OPTION" and not inst.get("underlyingSymbol"):
                underlying = "".join(ch for ch in symbol if ch.isalpha()) or symbol

            instruction = "SELL_TO_CLOSE" if qty > 0 else "BUY_TO_COVER"
            if asset_type == "EQUITY":
                instruction = "SELL" if qty > 0 else "BUY_TO_COVER"

            rows.append(
                {
                    "account_hash": account_hash,
                    "account_number": display_acct,
                    "symbol": symbol,
                    "underlying": underlying,
                    "description": str(inst.get("description") or ""),
                    "asset_type": asset_type,
                    "quantity": qty,
                    "average_price": avg,
                    "market_value": market_value,
                    "mark": round(mark, 4) if mark is not None else None,
                    "pnl_pct": round(pnl_pct, 2) if pnl_pct is not None else None,
                    "day_pnl": float(day_pnl) if day_pnl is not None else None,
                    "day_pnl_pct": float(day_pnl_pct) if day_pnl_pct is not None else None,
                    "close_instruction": instruction,
                    "multiplier": multiplier,
                }
            )
    rows.sort(
        key=lambda r: (
            str(r.get("account_number") or ""),
            r.get("underlying") or "",
            r.get("symbol") or "",
        )
    )
    return rows

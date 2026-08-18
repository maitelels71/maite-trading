"""Schwab brokerage positions + open / close / TP check / TP ladder limits."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.config import settings
from app.providers.exceptions import (
    ProviderError,
    ProviderNotConfiguredError,
    ProviderRateLimitError,
)
from app.domain.session_calendar import is_cash_rth
from app.providers.schwab_trader import (
    DESK_RISK_PCT,
    SchwabTrader,
    build_occ_option_symbol,
    normalize_account_summaries,
    normalize_order,
    normalize_positions,
    size_long_option,
    split_tp_ladder_quantities,
)

router = APIRouter(prefix="/broker", tags=["broker"])

RATE_LIMIT_DETAIL = (
    "Schwab Trader rate limit. Wait ~30 seconds, then retry. "
    "Avoid extra Load capital clicks."
)


class PositionsResponse(BaseModel):
    trading_enabled: bool
    accounts: list[dict]
    positions: list[dict]
    orders: list[dict] = []
    risk_pct: float = DESK_RISK_PCT
    error: str | None = None


class CloseOrderRequest(BaseModel):
    account_hash: str
    symbol: str
    quantity: float = Field(gt=0)
    asset_type: str = "OPTION"
    instruction: str = "SELL_TO_CLOSE"
    order_type: str = "MARKET"
    limit_price: float | None = None
    duration: str = "DAY"
    confirm_live: bool = False


class CloseOrderResponse(BaseModel):
    ok: bool
    order_id: str | None = None
    status: str
    message: str = ""
    http_status: int | None = None


class OpenOrderRequest(BaseModel):
    account_hash: str
    underlying: str
    option_type: str = "CALL"
    strike: float = Field(gt=0)
    exp_iso: str
    entry_premium: float = Field(gt=0)
    quantity: int | None = Field(default=None, ge=1)
    order_type: str = "LIMIT"
    duration: str = "DAY"
    confirm_live: bool = False
    # From the last Load capital — avoids extra Schwab GETs (rate limit).
    equity: float | None = Field(default=None, ge=0)
    cash_available: float | None = Field(default=None, ge=0)


class OpenOrderResponse(BaseModel):
    ok: bool
    order_id: str | None = None
    status: str
    message: str = ""
    option_symbol: str | None = None
    limit_price: float | None = None
    quantity: int | None = None
    cost: float | None = None
    risk_budget: float | None = None
    http_status: int | None = None


class TpCheckRequest(BaseModel):
    account_hash: str
    symbol: str
    quantity: float = Field(gt=0)
    asset_type: str = "OPTION"
    instruction: str = "SELL_TO_CLOSE"
    average_price: float = Field(gt=0)
    target_pct: float = Field(gt=0, le=500)
    auto_close: bool = False
    confirm_live: bool = False
    order_type: str = "MARKET"


class TpCheckResponse(BaseModel):
    symbol: str
    mark: float | None = None
    pnl_pct: float | None = None
    target_pct: float
    hit: bool
    closed: bool = False
    order_id: str | None = None
    message: str = ""


class TpLadderRequest(BaseModel):
    account_hash: str
    symbol: str
    quantity: float = Field(gt=0)
    asset_type: str = "OPTION"
    instruction: str = "SELL_TO_CLOSE"
    average_price: float = Field(gt=0)
    duration: str = "GOOD_TILL_CANCEL"
    confirm_live: bool = False


class TpLadderLeg(BaseModel):
    pct: float
    quantity: int
    limit_price: float
    order_id: str | None = None
    ok: bool
    message: str = ""


class TpLadderResponse(BaseModel):
    ok: bool
    symbol: str
    legs: list[TpLadderLeg]
    message: str = ""


@router.get("/positions", response_model=PositionsResponse)
def get_positions(
    include_orders: bool = Query(default=True),
) -> PositionsResponse:
    try:
        trader = SchwabTrader()
        hashes = trader.list_account_hashes()
        accounts = trader.list_accounts_with_positions()
        positions = normalize_positions(accounts, hashes)
        summaries = normalize_account_summaries(accounts, hashes)
        by_hash = {str(s.get("hashValue")): s for s in summaries if s.get("hashValue")}
        account_rows: list[dict] = []
        for h in hashes:
            hv = str(h.get("hashValue") or "")
            base = by_hash.get(hv) or {
                "accountNumber": h.get("accountNumber"),
                "hashValue": hv,
                "equity": 0.0,
                "cash_balance": 0.0,
                "available_funds": 0.0,
                "buying_power": 0.0,
                "risk_pct": DESK_RISK_PCT,
                "risk_budget": 0.0,
            }
            account_rows.append(base)

        orders: list[dict] = []
        if include_orders:
            for h in hashes:
                hv = h.get("hashValue")
                if not hv:
                    continue
                try:
                    raw_orders = trader.list_orders(hv)
                except ProviderRateLimitError:
                    break
                except ProviderError:
                    continue
                for row in raw_orders:
                    norm = normalize_order(
                        row,
                        hv,
                        account_number=str(h.get("accountNumber") or ""),
                    )
                    if norm:
                        orders.append(norm)

        def _ord_key(o: dict) -> tuple:
            st = str(o.get("status") or "").upper()
            working = 0 if st in {
                "WORKING",
                "PENDING_ACTIVATION",
                "QUEUED",
                "ACCEPTED",
                "AWAITING_PARENT_ORDER",
            } else 1
            return (working, str(o.get("entered_time") or ""), str(o.get("symbol") or ""))

        orders.sort(key=_ord_key)
        return PositionsResponse(
            trading_enabled=bool(settings.schwab_trading_enabled),
            accounts=account_rows,
            positions=positions,
            orders=orders,
            risk_pct=DESK_RISK_PCT,
        )
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ProviderRateLimitError as exc:
        raise HTTPException(status_code=429, detail=RATE_LIMIT_DETAIL) from exc
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/orders/open", response_model=OpenOrderResponse)
def open_option_position(body: OpenOrderRequest) -> OpenOrderResponse:
    """BUY_TO_OPEN LIMIT at mid-optimal premium, sized to 10% equity risk."""
    if not body.confirm_live:
        raise HTTPException(
            status_code=400,
            detail="confirm_live must be true to place a live open order",
        )
    if not is_cash_rth():
        raise HTTPException(
            status_code=400,
            detail="Cash RTH is 9:30–4:00 ET. Open tomorrow after the open — do not retry after hours.",
        )
    try:
        trader = SchwabTrader()
        if (
            body.equity is not None
            and body.equity > 0
            and body.cash_available is not None
        ):
            equity = float(body.equity)
            cash = float(body.cash_available)
        else:
            hashes = trader.list_account_hashes()
            accounts = trader.list_accounts_with_positions()
            summaries = normalize_account_summaries(accounts, hashes)
            acct = next(
                (
                    s
                    for s in summaries
                    if str(s.get("hashValue")) == body.account_hash
                ),
                None,
            )
            if acct is None:
                raise HTTPException(status_code=400, detail="unknown account_hash")
            equity = float(acct.get("equity") or 0)
            cash = float(acct.get("available_funds") or acct.get("cash_balance") or 0)
        sizing = size_long_option(
            entry_premium=body.entry_premium,
            equity=equity,
            cash_available=cash,
        )
        cost_1 = float(sizing["cost_per_contract"])
        max_qty = int(sizing["contracts"])
        if max_qty < 1:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"1ct ${cost_1:.2f} = {sizing['actual_risk_pct']}% of equity "
                    f"${equity:.2f}. Consider ≤10% (budget ${sizing['risk_budget']:.2f}); "
                    f"open allowed ≤50% (need ${sizing['equity_for_max_open']:.2f} equity)"
                    + (
                        f", or ${sizing['cash_shortfall']:.2f} more cash."
                        if float(sizing["cash_shortfall"]) > 0
                        else "."
                    )
                ),
            )

        qty = int(body.quantity) if body.quantity else max_qty
        if qty < 1 or qty > max_qty:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"quantity {qty} exceeds max {max_qty} "
                    f"(≤50% equity / cash ${cash:.2f})"
                ),
            )

        option_symbol = build_occ_option_symbol(
            body.underlying,
            body.exp_iso,
            body.option_type,
            body.strike,
        )
        limit_px = round(float(body.entry_premium), 2)
        cost = round(limit_px * 100.0 * qty, 2)

        result = trader.place_order(
            account_hash=body.account_hash,
            symbol=option_symbol,
            quantity=float(qty),
            asset_type="OPTION",
            instruction="BUY_TO_OPEN",
            order_type=body.order_type or "LIMIT",
            limit_price=limit_px,
            duration=body.duration or "DAY",
        )
        return OpenOrderResponse(
            ok=True,
            order_id=result.get("order_id"),
            status=str(result.get("status") or "submitted"),
            message=(
                "BUY_TO_OPEN submitted · after fill use Positions → TP 10/20/35/50/100"
            ),
            option_symbol=option_symbol,
            limit_price=limit_px,
            quantity=qty,
            cost=cost,
            risk_budget=float(sizing["risk_budget"]),
            http_status=result.get("http_status"),
        )
    except HTTPException:
        raise
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ProviderRateLimitError as exc:
        raise HTTPException(status_code=429, detail=RATE_LIMIT_DETAIL) from exc
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/orders/close", response_model=CloseOrderResponse)
def close_position(body: CloseOrderRequest) -> CloseOrderResponse:
    if not body.confirm_live:
        raise HTTPException(
            status_code=400,
            detail="confirm_live must be true to place a live close order",
        )
    try:
        trader = SchwabTrader()
        result = trader.place_close_order(
            account_hash=body.account_hash,
            symbol=body.symbol,
            quantity=body.quantity,
            asset_type=body.asset_type,
            instruction=body.instruction,
            order_type=body.order_type,
            limit_price=body.limit_price,
            duration=body.duration,
        )
        return CloseOrderResponse(
            ok=True,
            order_id=result.get("order_id"),
            status=str(result.get("status") or "submitted"),
            message="Close order submitted to Schwab",
            http_status=result.get("http_status"),
        )
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ProviderRateLimitError as exc:
        raise HTTPException(status_code=429, detail=RATE_LIMIT_DETAIL) from exc
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/orders/tp-ladder", response_model=TpLadderResponse)
def place_tp_ladder(body: TpLadderRequest) -> TpLadderResponse:
    """Place scale-out LIMIT SELL_TO_CLOSE (or SELL) at +10/20/35/50/100% of avg."""
    if not body.confirm_live:
        raise HTTPException(
            status_code=400,
            detail="confirm_live must be true to place live TP limit orders",
        )
    if body.average_price <= 0:
        raise HTTPException(status_code=400, detail="average_price must be > 0")

    splits = split_tp_ladder_quantities(body.quantity)
    if not splits:
        raise HTTPException(status_code=400, detail="quantity must be >= 1")

    try:
        trader = SchwabTrader()
        legs: list[TpLadderLeg] = []
        all_ok = True
        for pct, qty in splits:
            if qty <= 0:
                continue
            limit_px = round(body.average_price * (1.0 + pct / 100.0), 2)
            try:
                result = trader.place_close_order(
                    account_hash=body.account_hash,
                    symbol=body.symbol,
                    quantity=float(qty),
                    asset_type=body.asset_type,
                    instruction=body.instruction,
                    order_type="LIMIT",
                    limit_price=limit_px,
                    duration=body.duration,
                )
                legs.append(
                    TpLadderLeg(
                        pct=pct,
                        quantity=qty,
                        limit_price=limit_px,
                        order_id=result.get("order_id"),
                        ok=True,
                        message="submitted",
                    )
                )
            except ProviderError as exc:
                all_ok = False
                legs.append(
                    TpLadderLeg(
                        pct=pct,
                        quantity=qty,
                        limit_price=limit_px,
                        order_id=None,
                        ok=False,
                        message=str(exc),
                    )
                )
        return TpLadderResponse(
            ok=all_ok,
            symbol=body.symbol,
            legs=legs,
            message=(
                "TP ladder submitted to Schwab"
                if all_ok
                else "TP ladder partially failed — check legs"
            ),
        )
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ProviderRateLimitError as exc:
        raise HTTPException(status_code=429, detail=RATE_LIMIT_DETAIL) from exc
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/tp-check", response_model=TpCheckResponse)
def tp_check(body: TpCheckRequest) -> TpCheckResponse:
    """Quote mark, compute P&L %, optionally auto-close when target is hit."""
    try:
        trader = SchwabTrader()
        quotes = trader.get_quotes([body.symbol])
        q = quotes.get(body.symbol) or quotes.get(body.symbol.upper()) or {}
        quote_body = q.get("quote") if isinstance(q.get("quote"), dict) else q
        mark_raw = (
            quote_body.get("mark")
            or quote_body.get("lastPrice")
            or quote_body.get("last")
            or quote_body.get("askPrice")
            or quote_body.get("bidPrice")
        )
        mark = float(mark_raw) if mark_raw is not None else None
        pnl_pct = None
        if mark is not None and body.average_price > 0:
            if body.instruction.upper() in {"SELL_TO_CLOSE", "SELL"}:
                pnl_pct = ((mark - body.average_price) / body.average_price) * 100.0
            else:
                pnl_pct = ((body.average_price - mark) / body.average_price) * 100.0
            pnl_pct = round(pnl_pct, 2)

        hit = pnl_pct is not None and pnl_pct >= body.target_pct
        if not hit:
            return TpCheckResponse(
                symbol=body.symbol,
                mark=mark,
                pnl_pct=pnl_pct,
                target_pct=body.target_pct,
                hit=False,
                message="Target not reached",
            )

        if not body.auto_close:
            return TpCheckResponse(
                symbol=body.symbol,
                mark=mark,
                pnl_pct=pnl_pct,
                target_pct=body.target_pct,
                hit=True,
                message="Target hit — alert only (auto-close off)",
            )

        if not body.confirm_live:
            return TpCheckResponse(
                symbol=body.symbol,
                mark=mark,
                pnl_pct=pnl_pct,
                target_pct=body.target_pct,
                hit=True,
                message="Target hit but confirm_live=false — no order sent",
            )

        result = trader.place_close_order(
            account_hash=body.account_hash,
            symbol=body.symbol,
            quantity=body.quantity,
            asset_type=body.asset_type,
            instruction=body.instruction,
            order_type=body.order_type,
        )
        return TpCheckResponse(
            symbol=body.symbol,
            mark=mark,
            pnl_pct=pnl_pct,
            target_pct=body.target_pct,
            hit=True,
            closed=True,
            order_id=result.get("order_id"),
            message="Target hit — close order submitted",
        )
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ProviderRateLimitError as exc:
        raise HTTPException(status_code=429, detail=RATE_LIMIT_DETAIL) from exc
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc

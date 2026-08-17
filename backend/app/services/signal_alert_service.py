"""Scan Options + Futures desks and notify ready-to-enter setups (email preferred)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.config import settings
from app.core.constants import (
    FUTURES_ALERT_STRATEGIES,
    OPTIONS_ALERT_STRATEGIES,
)
from app.core.logging import get_logger
from app.domain.enums import DataProviderName
from app.domain.session_calendar import resolve_operative_session_date
from app.schemas.strategy_api import StrategyScanRequest
from app.services.alert_dedup import claim_alert
from app.services.email_sender import EmailSendError, publish_email
from app.services.signal_candidates import (
    AlertCandidate,
    format_sms,
    futures_candidates,
    options_candidates,
)
from app.services.sms_sender import SmsSendError, publish_sms
from app.strategies.registry import get_strategy_registry

logger = get_logger(__name__)

_OPTIONS_PROVIDER = DataProviderName.SCHWAB.value
_FUTURES_PROVIDER = DataProviderName.TRADEADVOCATE.value
_MAX_ALERTS_PER_TICK = 8
# Stable subject token for Gmail filters (Subject contains → label/folder).
ALERT_EMAIL_SUBJECT_TAG = "[MAITE-ALERT]"


def run_signal_alerts(
    *,
    db: Any = None,
    sns_client: Any | None = None,
    email_client: Any | None = None,
    sync: bool = True,
) -> dict[str, Any]:
    """One poll: sync candles, scan, filter, email (or SMS) new fingerprints."""
    enabled = bool(settings.sms_alerts_enabled)
    email_to = (settings.alert_email_to or "").strip()
    phone = (settings.sms_alert_phone or "").strip()
    use_email = bool(email_to)
    use_sms = bool(phone) and not use_email

    if not enabled:
        return {"ok": True, "skipped": "disabled", "sent": 0}
    if not use_email and not use_sms:
        return {"ok": True, "skipped": "no_destination", "sent": 0}

    cash_session = resolve_operative_session_date(market="cash")
    fut_session = resolve_operative_session_date(market="futures")
    session_s = cash_session.isoformat()
    summary: dict[str, Any] = {
        "ok": True,
        "session": session_s,
        "futures_session": fut_session.isoformat(),
        "channel": "email" if use_email else "sms",
        "sent": 0,
        "skipped_dup": 0,
        "options_candidates": 0,
        "futures_candidates": 0,
        "errors": [],
        "messages": [],
    }

    if sync:
        try:
            _sync_for_alerts(db=db)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Alert candle sync failed")
            summary["errors"].append(f"sync: {exc}")

    from app.services import scan_service

    options_hits: list = []
    futures_hits: list = []
    try:
        opt_scan = scan_service.run_scan(
            StrategyScanRequest(
                strategies=list(OPTIONS_ALERT_STRATEGIES),
                timeframe="1h",
                session_date=cash_session,
                data_provider=_OPTIONS_PROVIDER,
                matches_only=True,
            ),
            db=db,
        )
        options_hits = list(opt_scan.hits)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Options alert scan failed")
        summary["errors"].append(f"options_scan: {exc}")

    try:
        fut_scan = scan_service.run_scan(
            StrategyScanRequest(
                strategies=list(FUTURES_ALERT_STRATEGIES),
                timeframe="1h",
                session_date=fut_session,
                data_provider=_FUTURES_PROVIDER,
                matches_only=True,
            ),
            db=db,
        )
        futures_hits = list(fut_scan.hits)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Futures alert scan failed")
        summary["errors"].append(f"futures_scan: {exc}")

    capital = _load_options_capital()
    candidates: list[AlertCandidate] = []
    if capital is None:
        summary["errors"].append("options_capital: unavailable")
    else:
        opt = options_candidates(
            options_hits,
            session=session_s,
            equity=float(capital.get("equity") or 0),
            cash_available=float(
                capital.get("available_funds")
                or capital.get("cash_balance")
                or 0
            ),
        )
        summary["options_candidates"] = len(opt)
        candidates.extend(opt)

    fut = futures_candidates(futures_hits, session=fut_session.isoformat())
    summary["futures_candidates"] = len(fut)
    candidates.extend(fut)

    for cand in candidates[:_MAX_ALERTS_PER_TICK]:
        if not claim_alert(
            cand.fingerprint,
            payload={
                "venue": cand.venue,
                "symbol": cand.symbol,
                "side": cand.side_label,
                "strategies": list(cand.strategies),
                "channel": summary["channel"],
            },
        ):
            summary["skipped_dup"] += 1
            continue
        text = format_sms(cand)
        try:
            if use_email:
                publish_email(
                    email_to,
                    subject=f"{ALERT_EMAIL_SUBJECT_TAG} {text}",
                    body=(
                        f"{text}\n\n"
                        f"Session {session_s}\n"
                        f"Desk: {cand.venue}\n"
                        f"Detail: {cand.detail or '—'}\n"
                    ),
                    client=email_client,
                )
            else:
                publish_sms(phone, text, client=sns_client)
            summary["sent"] += 1
            summary["messages"].append(text)
        except (EmailSendError, SmsSendError) as exc:
            summary["errors"].append(f"notify {cand.symbol}: {exc}")

    return summary

def _load_options_capital() -> dict[str, Any] | None:
    try:
        from app.providers.schwab_trader import (
            SchwabTrader,
            normalize_account_summaries,
        )

        trader = SchwabTrader()
        hashes = trader.list_account_hashes()
        accounts = trader.list_accounts_with_positions()
        rows = normalize_account_summaries(accounts, hashes)
        if not rows:
            return None
        return max(rows, key=lambda r: float(r.get("equity") or 0))
    except Exception:  # noqa: BLE001
        logger.exception("Could not load Schwab capital for options SMS")
        return None


def _timeframes_for(strategy_names: tuple[str, ...]) -> set[str]:
    registry = get_strategy_registry()
    tfs: set[str] = set()
    for name in strategy_names:
        try:
            strategy = registry.get(name)
        except KeyError:
            continue
        resolve_tf = getattr(strategy, "scan_timeframe", None) or "1h"
        tfs.add(str(resolve_tf))
        extra = tuple(getattr(strategy, "scan_extra_timeframes", ()) or ())
        tfs.update(str(x) for x in extra)
    return tfs


def _lookback_days(strategy_names: tuple[str, ...]) -> int:
    registry = get_strategy_registry()
    days = 20
    for name in strategy_names:
        try:
            strategy = registry.get(name)
        except KeyError:
            continue
        days = max(days, int(getattr(strategy, "scan_lookback_days", 0) or 0))
    return days


# Leave headroom for scan + Gmail send inside the Lambda timeout.
_ALERT_SYNC_BUDGET_SEC = 90.0


def _sync_for_alerts(*, db: Any = None) -> None:
    """Refresh candles the scanners need (best-effort per symbol/TF)."""
    from app.api.storage import get_dynamo_store, using_dynamo
    from app.api.strategy import _list_scan_instruments
    from app.providers.factory import get_provider_factory
    from app.services.market_data_service import MarketDataService, validate_candles

    end = datetime.now(UTC)
    deadline = end.timestamp() + _ALERT_SYNC_BUDGET_SEC
    factory = get_provider_factory()

    jobs: list[tuple[str, tuple[str, ...]]] = [
        (_OPTIONS_PROVIDER, OPTIONS_ALERT_STRATEGIES),
        (_FUTURES_PROVIDER, FUTURES_ALERT_STRATEGIES),
    ]
    for provider_name, strategies in jobs:
        tfs = _timeframes_for(strategies)
        lookback = _lookback_days(strategies)
        start = end - timedelta(days=lookback)
        instruments = _list_scan_instruments(
            db,
            data_provider=provider_name,
            symbols=None,
        )
        for inst in instruments:
            if datetime.now(UTC).timestamp() >= deadline:
                logger.warning("Alert sync budget exhausted; scanning with cached candles")
                return
            try:
                provider = factory.get(DataProviderName(inst["data_provider"]))
            except Exception:  # noqa: BLE001
                continue
            for tf in tfs:
                if datetime.now(UTC).timestamp() >= deadline:
                    logger.warning(
                        "Alert sync budget exhausted; scanning with cached candles"
                    )
                    return
                try:
                    candles = provider.get_historical_candles(
                        inst["symbol"], tf, start, end
                    )
                    validate_candles(candles)
                    if using_dynamo():
                        get_dynamo_store().save_candles(
                            inst["symbol"],
                            inst["market_type"],
                            tf,
                            candles,
                        )
                    elif db is not None:
                        mds = MarketDataService(db)
                        row = mds.get_instrument(
                            inst["symbol"],
                            market_type=inst["market_type"],
                        )
                        mds.save_candles(row.id, tf, candles)
                        db.commit()
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "Alert sync failed %s %s: %s",
                        inst["symbol"],
                        tf,
                        exc,
                    )

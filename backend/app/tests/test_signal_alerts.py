"""TOP5 confluence + options capital + SMS formatting for ready-to-enter alerts."""

from __future__ import annotations

from types import SimpleNamespace

from app.core.constants import (
    STRATEGY_CR04_GAP_UP,
    STRATEGY_E01_BB_FLIP,
    STRATEGY_E03_MAGNET,
    STRATEGY_E04_BB15_GAP,
    STRATEGY_ML01_STRUCTURE,
)
from app.domain.confluence import rank_by_confluence
from app.domain.enums import Side
from app.services.alert_dedup import claim_alert, clear_memory
from app.services.signal_alert_service import run_signal_alerts
from app.services.signal_candidates import (
    format_sms,
    futures_candidates,
    options_candidates,
)
from app.services.sms_sender import publish_sms


def _hit(
    symbol: str,
    strategy: str,
    *,
    side: str = "long",
    status: str | None = None,
    matched: bool = True,
    ts: str = "2026-08-15T10:00:00",
):
    return SimpleNamespace(
        symbol=symbol,
        name=symbol,
        strategy=strategy,
        matched=matched,
        status=status or f"signal_{side}",
        last_signal=SimpleNamespace(side=Side(side), timestamp=ts),
        detail="ready",
    )


def test_rank_keeps_stronger_side_and_drops_ties() -> None:
    hits = [
        _hit("SPY", STRATEGY_E01_BB_FLIP, side="long"),
        _hit("SPY", STRATEGY_E03_MAGNET, side="long"),
        _hit("SPY", STRATEGY_CR04_GAP_UP, side="short"),
        _hit("QQQ", STRATEGY_E01_BB_FLIP, side="long"),
        _hit("QQQ", STRATEGY_E04_BB15_GAP, side="short"),
    ]
    ranked = rank_by_confluence(hits, top_n=5)
    by_sym = {g.symbol: g for g in ranked}
    assert "SPY" in by_sym
    assert by_sym["SPY"].side == "long"
    assert by_sym["SPY"].confluence == 2
    assert by_sym["SPY"].opposed_count == 1
    assert "QQQ" not in by_sym  # CALL/PUT tie


def test_rank_ready_only_skips_flat_and_watching() -> None:
    hits = [
        _hit("SPY", STRATEGY_E01_BB_FLIP, status="watching", matched=False),
        _hit("SPY", STRATEGY_E03_MAGNET, status="flat_after_trades", matched=True),
        _hit("IWM", STRATEGY_E01_BB_FLIP, side="short", status="active_short"),
        _hit("IWM", STRATEGY_E04_BB15_GAP, side="short"),
    ]
    ranked = rank_by_confluence(hits, top_n=5)
    assert [g.symbol for g in ranked] == ["IWM"]
    assert ranked[0].confluence == 2


def test_options_requires_multiple_confluence_and_capital() -> None:
    hits = [
        _hit("SPY", STRATEGY_E01_BB_FLIP),
        _hit("SPY", STRATEGY_E03_MAGNET),
        _hit("QQQ", STRATEGY_E04_BB15_GAP),
    ]
    ok = options_candidates(
        hits,
        session="2026-08-15",
        equity=774.24,
        cash_available=774.24,
    )
    assert [c.symbol for c in ok] == ["SPY"]
    assert ok[0].confluence == 2
    assert ok[0].contracts >= 1
    assert ok[0].side_label == "CALL"

    too_small = options_candidates(
        hits,
        session="2026-08-15",
        equity=10.0,
        cash_available=10.0,
    )
    assert too_small == []


def test_futures_sends_every_ready_signal() -> None:
    hits = [
        _hit("MNQ", STRATEGY_ML01_STRUCTURE, side="long"),
        _hit("ES", STRATEGY_ML01_STRUCTURE, side="short"),
        _hit("NQ", STRATEGY_ML01_STRUCTURE, status="watching", matched=False),
    ]
    out = futures_candidates(hits, session="2026-08-15")
    assert [(c.symbol, c.side_label) for c in out] == [
        ("ES", "SHORT"),
        ("MNQ", "LONG"),
    ]
    text = format_sms(out[1])
    assert text.startswith("FUT MNQ LONG")
    assert "ML01" in text


def test_format_options_sms() -> None:
    hits = [
        _hit("SPY", STRATEGY_E01_BB_FLIP),
        _hit("SPY", STRATEGY_E03_MAGNET),
        _hit("SPY", STRATEGY_CR04_GAP_UP),
    ]
    cand = options_candidates(
        hits,
        session="2026-08-15",
        equity=774.24,
        cash_available=774.24,
    )[0]
    text = format_sms(cand)
    assert text.startswith("OPT SPY CALL")
    assert "E01+E03+CR04" in text
    assert "3 conf" in text


def test_claim_alert_dedup() -> None:
    clear_memory()
    assert claim_alert("a|options|SPY|long|e01") is True
    assert claim_alert("a|options|SPY|long|e01") is False
    assert claim_alert("a|options|SPY|long|e01,e03") is True
    clear_memory()


def test_publish_sms_mock_client() -> None:
    class FakeSns:
        def __init__(self) -> None:
            self.calls: list[dict] = []

        def publish(self, **kwargs):
            self.calls.append(kwargs)
            return {"MessageId": "mid-1"}

    fake = FakeSns()
    mid = publish_sms("+15555550100", "OPT SPY CALL · E01+E03", client=fake)
    assert mid == "mid-1"
    assert fake.calls[0]["PhoneNumber"] == "+15555550100"
    assert fake.calls[0]["MessageAttributes"]["AWS.SNS.SMS.SMSType"]["StringValue"] == (
        "Transactional"
    )


def test_run_skips_without_phone(monkeypatch) -> None:
    from app.core import config as config_mod

    monkeypatch.setattr(config_mod.settings, "sms_alert_phone", "")
    monkeypatch.setattr(config_mod.settings, "sms_alerts_enabled", True)
    result = run_signal_alerts(sync=False)
    assert result["skipped"] == "no_phone"
    assert result["sent"] == 0

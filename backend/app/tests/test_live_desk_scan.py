"""Live futures desk match gates (Globex + ML03 NY RTH)."""

from app.api.strategy import _live_desk_allows_match
from app.strategies.ml01_structure_choch_bos import Ml01StructureChochBosStrategy
from app.strategies.ml03_first_ny5m import Ml03FirstNy5mStrategy


def test_futures_blocked_when_globex_closed(monkeypatch) -> None:
    monkeypatch.setattr("app.api.strategy.is_globex_open", lambda: False)
    ok, detail = _live_desk_allows_match(
        Ml01StructureChochBosStrategy(),
        data_provider="tradeadvocate",
    )
    assert ok is False
    assert "Globex closed" in detail


def test_ml03_blocked_outside_cash_rth(monkeypatch) -> None:
    monkeypatch.setattr("app.api.strategy.is_globex_open", lambda: True)
    monkeypatch.setattr("app.api.strategy.is_cash_rth", lambda: False)
    ok, detail = _live_desk_allows_match(
        Ml03FirstNy5mStrategy(),
        data_provider="tradeadvocate",
    )
    assert ok is False
    assert "NY RTH" in detail
    ok_ml01, _ = _live_desk_allows_match(
        Ml01StructureChochBosStrategy(),
        data_provider="tradeadvocate",
    )
    assert ok_ml01 is True


def test_ml03_live_during_cash_rth(monkeypatch) -> None:
    monkeypatch.setattr("app.api.strategy.is_globex_open", lambda: True)
    monkeypatch.setattr("app.api.strategy.is_cash_rth", lambda: True)
    ok, _ = _live_desk_allows_match(
        Ml03FirstNy5mStrategy(),
        data_provider="tradeadvocate",
    )
    assert ok is True


def test_options_desk_not_gated_by_globex(monkeypatch) -> None:
    monkeypatch.setattr("app.api.strategy.is_globex_open", lambda: False)
    ok, _ = _live_desk_allows_match(
        Ml01StructureChochBosStrategy(),
        data_provider="schwab",
    )
    assert ok is True

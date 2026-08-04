"""Architecture boundary and wiring tests for Prompt 2."""

from __future__ import annotations

import ast
from datetime import date
from pathlib import Path

import pytest

from app.domain import Candle, MarketType, StrategyContext
from app.domain.enums import DataProviderName
from app.providers.factory import ProviderFactory
from app.providers.schwab import SchwabProvider
from app.providers.tradeadvocate import TradeAdvocateProvider
from app.ports.market_data import MarketDataProvider
from app.ports.strategy import Strategy
from app.services.strategy_engine import StrategyEngine
from app.strategies.opening_range_breakout import OpeningRangeBreakoutStrategy
from app.strategies.registry import build_default_registry


BACKEND_ROOT = Path(__file__).resolve().parents[2]
STRATEGIES_DIR = BACKEND_ROOT / "app" / "strategies"


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.add(alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def test_strategies_do_not_import_providers() -> None:
    forbidden_prefixes = ("app.providers",)
    for path in STRATEGIES_DIR.rglob("*.py"):
        imports = _imported_modules(path)
        for mod in imports:
            assert not any(
                mod == p or mod.startswith(p + ".") for p in forbidden_prefixes
            ), f"{path.name} imports provider module '{mod}'"


def test_strategy_engine_module_does_not_import_brokers() -> None:
    engine_path = BACKEND_ROOT / "app" / "services" / "strategy_engine.py"
    imports = _imported_modules(engine_path)
    for mod in imports:
        assert "schwab" not in mod.lower()
        assert "tradeadvocate" not in mod.lower()
        assert not mod.startswith("app.providers")


def test_provider_factory_routes_by_market_type() -> None:
    factory = ProviderFactory()
    assert isinstance(factory.for_market_type(MarketType.STOCK), SchwabProvider)
    assert isinstance(factory.for_market_type(MarketType.ETF), SchwabProvider)
    assert isinstance(factory.for_market_type(MarketType.FUTURE), TradeAdvocateProvider)
    assert factory.get(DataProviderName.SCHWAB).name is DataProviderName.SCHWAB
    assert (
        factory.get(DataProviderName.TRADEADVOCATE).name
        is DataProviderName.TRADEADVOCATE
    )


def test_providers_satisfy_protocol() -> None:
    factory = ProviderFactory()
    for provider in (
        factory.get(DataProviderName.SCHWAB),
        factory.get(DataProviderName.TRADEADVOCATE),
    ):
        assert isinstance(provider, MarketDataProvider)


def test_orb_strategy_registered_and_satisfies_protocol() -> None:
    registry = build_default_registry()
    strategy = registry.get("opening_range_breakout")
    assert isinstance(strategy, OpeningRangeBreakoutStrategy)
    assert isinstance(strategy, Strategy)
    assert "opening_range_minutes" in strategy.default_parameters


def test_strategy_engine_lists_orb() -> None:
    engine = StrategyEngine(build_default_registry())
    names = {s.name for s in engine.list_strategies()}
    assert "opening_range_breakout" in names


def test_orb_evaluate_produces_long_trade() -> None:
    from datetime import datetime
    from decimal import Decimal
    from zoneinfo import ZoneInfo

    from app.domain.candles import Candle
    from app.domain.enums import Side

    et = ZoneInfo("America/New_York")
    strategy = OpeningRangeBreakoutStrategy()

    def c(h: int, m: int, high: str, low: str, close: str) -> Candle:
        return Candle(
            timestamp=datetime(2026, 1, 5, h, m, tzinfo=et),
            open=Decimal(close),
            high=Decimal(high),
            low=Decimal(low),
            close=Decimal(close),
            volume=Decimal("1"),
            ticker="SPY",
            timeframe="5m",
        )

    result = strategy.evaluate(
        [c(9, 30, "100", "99", "99.5"), c(9, 35, "101", "100", "100.5"), c(15, 55, "101", "100", "100.8")],
        StrategyContext(
            ticker="SPY",
            timeframe="5m",
            start=date(2026, 1, 5),
            end=date(2026, 1, 5),
        ),
    )
    assert result.metrics.total_trades == 1
    assert result.trades[0].side is Side.LONG


def test_candle_domain_is_frozen() -> None:
    from datetime import UTC, datetime
    from decimal import Decimal

    from app.domain.enums import Timeframe

    c = Candle(
        timestamp=datetime(2026, 1, 2, tzinfo=UTC),
        open=Decimal("1"),
        high=Decimal("2"),
        low=Decimal("0.5"),
        close=Decimal("1.5"),
        volume=Decimal("100"),
        ticker="SPY",
        timeframe=Timeframe.M5,
    )
    with pytest.raises(Exception):
        c.ticker = "QQQ"  # type: ignore[misc]

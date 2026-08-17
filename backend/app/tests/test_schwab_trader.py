"""Unit tests for Schwab position normalization + TP math helpers."""

from app.providers.schwab_trader import normalize_positions


def test_normalize_option_long_position():
    accounts = [
        {
            "securitiesAccount": {
                "accountNumber": "123",
                "positions": [
                    {
                        "longQuantity": 2,
                        "shortQuantity": 0,
                        "averagePrice": 1.50,
                        "marketValue": 360.0,  # 2 * 100 * 1.80
                        "instrument": {
                            "symbol": "AMZN  250815C00190000",
                            "assetType": "OPTION",
                            "underlyingSymbol": "AMZN",
                            "description": "AMZN Aug 15 2025 190 Call",
                        },
                    }
                ],
            }
        }
    ]
    hashes = [{"accountNumber": "123", "hashValue": "abcHASH"}]
    rows = normalize_positions(accounts, hashes)
    assert len(rows) == 1
    row = rows[0]
    assert row["symbol"].startswith("AMZN")
    assert row["underlying"] == "AMZN"
    assert row["quantity"] == 2
    assert row["mark"] == 1.8
    assert row["pnl_pct"] == 20.0
    assert row["close_instruction"] == "SELL_TO_CLOSE"
    assert row["account_hash"] == "abcHASH"
    assert row["account_number"] == "123"


def test_normalize_equity_long():
    accounts = [
        {
            "securitiesAccount": {
                "accountNumber": "999",
                "positions": [
                    {
                        "longQuantity": 10,
                        "averagePrice": 100,
                        "marketValue": 1100,
                        "instrument": {"symbol": "AAPL", "assetType": "EQUITY"},
                    }
                ],
            }
        }
    ]
    rows = normalize_positions(accounts, [{"accountNumber": "999", "hashValue": "h9"}])
    assert rows[0]["pnl_pct"] == 10.0
    assert rows[0]["close_instruction"] == "SELL"


def test_split_tp_ladder_quantities():
    from app.providers.schwab_trader import split_tp_ladder_quantities

    assert split_tp_ladder_quantities(1) == [(35.0, 1)]
    assert split_tp_ladder_quantities(2) == [(20.0, 1), (35.0, 1)]
    assert split_tp_ladder_quantities(3) == [(10.0, 1), (20.0, 1), (35.0, 1)]
    assert split_tp_ladder_quantities(4) == [(10.0, 1), (20.0, 1), (35.0, 2)]
    assert split_tp_ladder_quantities(5) == [(10.0, 1), (20.0, 1), (35.0, 3)]


def test_build_occ_option_symbol():
    from app.providers.schwab_trader import build_occ_option_symbol

    assert (
        build_occ_option_symbol("AMZN", "2025-08-15", "CALL", 190)
        == "AMZN  250815C00190000"
    )
    assert (
        build_occ_option_symbol("AAPL", "2026-08-18", "PUT", 220.5)
        == "AAPL  260818P00220500"
    )


def test_size_long_option_10pct():
    from app.providers.schwab_trader import size_long_option

    # $50k equity → $5k risk; $2.50 premium → $250/contract → 20 contracts
    s = size_long_option(entry_premium=2.5, equity=50_000, cash_available=10_000)
    assert s["risk_budget"] == 5_000.0
    assert s["cost_per_contract"] == 250.0
    assert s["contracts"] == 20
    assert s["can_open"] is True

    # $113 equity → ~$11.30 risk; $185 premium → too expensive
    s2 = size_long_option(entry_premium=185.0, equity=113, cash_available=113)
    assert s2["risk_budget"] == 11.3
    assert s2["cost_per_contract"] == 18_500.0
    assert s2["contracts"] == 0
    assert s2["can_open"] is False
    assert s2["can_pay_cash"] is False
    assert s2["actual_risk_pct"] == 16371.7
    assert s2["equity_for_desk_rule"] == 185_000.0

    # Cheap premium that fits in 10% of $113
    s3 = size_long_option(entry_premium=0.10, equity=113, cash_available=113)
    assert s3["cost_per_contract"] == 10.0
    assert s3["contracts"] == 1
    assert s3["can_open"] is True
    assert s3["consider"] is True
    assert s3["actual_risk_pct"] == 8.8

    # 25% of equity: above 10% flag, but within 50% open cap
    s4 = size_long_option(entry_premium=0.50, equity=200, cash_available=80)
    assert s4["cost_per_contract"] == 50.0
    assert s4["consider"] is False
    assert s4["can_open"] is True
    assert s4["contracts"] == 1
    assert s4["can_pay_cash"] is True
    assert s4["actual_risk_pct"] == 25.0
    assert s4["equity_for_desk_rule"] == 500.0
    assert s4["equity_for_max_open"] == 100.0

    # 60% of equity: over 50% cap even with cash
    s5 = size_long_option(entry_premium=1.20, equity=200, cash_available=200)
    assert s5["cost_per_contract"] == 120.0
    assert s5["consider"] is False
    assert s5["can_open"] is False
    assert s5["actual_risk_pct"] == 60.0


def test_normalize_account_summaries():
    from app.providers.schwab_trader import normalize_account_summaries

    accounts = [
        {
            "securitiesAccount": {
                "accountNumber": "123",
                "currentBalances": {
                    "liquidationValue": 100_000,
                    "cashBalance": 20_000,
                    "availableFunds": 18_000,
                    "buyingPower": 36_000,
                },
            }
        }
    ]
    rows = normalize_account_summaries(
        accounts, [{"accountNumber": "123", "hashValue": "h123"}]
    )
    assert len(rows) == 1
    assert rows[0]["equity"] == 100_000.0
    assert rows[0]["risk_budget"] == 10_000.0
    assert rows[0]["available_funds"] == 18_000.0


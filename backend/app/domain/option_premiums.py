"""Desk OTM premiums used to test whether an options position can be opened.

Academy ATM bands in the XLS are too rich for a small account. SMS sizing
uses the Creando Riquezas OTM ranges (SPY 0.25–0.30, AAPL/META 0.45–0.80).
"""

from __future__ import annotations

# Mid of the desk OTM "rango rentable" (debit per share, ×100 = contract cost).
OTM_ENTRY_PREMIUM: dict[str, float] = {
    "SPY": 0.28,
    "QQQ": 0.28,
    "IWM": 0.40,
    "AAPL": 0.62,
    "META": 0.62,
    "MSFT": 0.62,
    "GOOGL": 0.62,
    "GOOG": 0.62,
    "AMZN": 0.70,
    "NVDA": 0.70,
    "TSLA": 0.70,
    "NFLX": 0.70,
}

DEFAULT_OTM_PREMIUM = 0.50


def entry_premium_for_sizing(symbol: str) -> float:
    key = str(symbol or "").strip().upper()
    if key == "GOOGL":
        key = "GOOG"
    return OTM_ENTRY_PREMIUM.get(key, DEFAULT_OTM_PREMIUM)

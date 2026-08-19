"""Yahoo Finance chart adapter — futures and equity/ETF analysis candles (no API key)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import Settings, settings
from app.core.logging import get_logger
from app.domain.candles import Candle
from app.indicators.aggregate import aggregate_candles
from app.providers.exceptions import ProviderError
from app.providers.http_utils import raise_for_provider_response
from app.providers.normalize import normalize_candles

logger = get_logger(__name__)

YAHOO_CHART_BASE = "https://query1.finance.yahoo.com"

# Desk aliases → Yahoo continuous futures (legacy FX pair names still map).
_YAHOO_FUTURES_ALIASES: dict[str, str] = {
    "6E": "6E=F",
    "6A": "6A=F",
    "6B": "6B=F",
    "EURUSD": "6E=F",
    "EUR": "6E=F",
    "GBPUSD": "6B=F",
    "GBP": "6B=F",
    "AUDUSD": "6A=F",
    "AUD": "6A=F",
    "GOLD": "GC=F",
    "XAUUSD": "GC=F",
}

# Longest roots first so MNQ does not collapse to NQ.
_YAHOO_FUTURES_ROOTS: tuple[str, ...] = (
    "MNQ",
    "MES",
    "MGC",
    "MYM",
    "MCL",
    "M2K",
    "NQ",
    "ES",
    "GC",
    "YM",
    "CL",
    "RTY",
    "6E",
    "6B",
    "6A",
)

_INTERVAL = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "60m",
    "4h": "60m",
    "1d": "1d",
    "Daily": "1d",
}

_MAX_LOOKBACK = {
    "1m": timedelta(days=7),
    "5m": timedelta(days=59),
    "15m": timedelta(days=59),
    "30m": timedelta(days=59),
}


def yahoo_equity_symbol(symbol: str) -> str:
    """Yahoo equity/ETF ticker (BRK.B → BRK-B). Do not map stocks to =F futures."""
    raw = str(symbol or "").strip().upper()
    return raw.replace(".", "-")


def yahoo_chart_symbol(symbol: str, *, futures: bool) -> str:
    return yahoo_futures_symbol(symbol) if futures else yahoo_equity_symbol(symbol)


def yahoo_futures_symbol(symbol: str) -> str:
    """Map desk roots / contract codes to Yahoo continuous futures (e.g. MNQ=F)."""
    raw = symbol.strip().upper()
    if raw.endswith("=F"):
        return raw
    if raw.startswith("/"):
        raw = raw[1:]
    alias = _YAHOO_FUTURES_ALIASES.get(raw)
    if alias:
        return alias
    for root in _YAHOO_FUTURES_ROOTS:
        if raw == root or raw.startswith(root):
            return f"{root}=F"
    return f"{raw}=F" if raw else symbol


class YahooProvider:
    """Historical futures bars via Yahoo chart API. No credentials."""

    def __init__(
        self,
        config: Settings | None = None,
        *,
        client: httpx.Client | None = None,
    ) -> None:
        self._config = config or settings
        self._client = client

    def authenticate(self) -> None:
        return

    def ensure_authenticated(self) -> None:
        return

    def _get_client(self) -> httpx.Client:
        if self._client is not None:
            return self._client
        self._client = httpx.Client(
            base_url=YAHOO_CHART_BASE,
            timeout=30.0,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept": "application/json",
            },
        )
        return self._client

    def get_historical_candles(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
        *,
        desk_ticker: str | None = None,
        as_futures: bool = True,
    ) -> list[Candle]:
        if not as_futures and timeframe == "1h":
            # Keep RTH Hora (9:30–10:00) like the old Schwab 30m aggregate.
            raw_30m = self.get_historical_candles(
                symbol,
                "30m",
                start,
                end,
                desk_ticker=desk_ticker,
                as_futures=False,
            )
            from app.indicators.aggregate import aggregate_rth_hora

            return aggregate_rth_hora(raw_30m, out_timeframe="1h")
        yahoo_symbol = yahoo_chart_symbol(symbol, futures=as_futures)
        interval = _INTERVAL.get(timeframe, "5m")
        start, end = _aware(start), _aware(end)
        cap = _MAX_LOOKBACK.get(interval)
        if cap is not None and end - start > cap:
            start = end - cap
        params = {
            "period1": str(int(start.timestamp())),
            "period2": str(int(end.timestamp())),
            "interval": interval,
            "includePrePost": "true",
            "events": "div,splits",
        }
        logger.info(
            "yahoo_candles desk=%s yahoo=%s tf=%s interval=%s",
            desk_ticker or symbol,
            yahoo_symbol,
            timeframe,
            interval,
        )
        response = self._get_chart(yahoo_symbol, params)
        raise_for_provider_response(response, provider="yahoo")
        rows = extract_yahoo_candles(response.json())
        ticker = desk_ticker or symbol
        norm_tf = "1h" if timeframe == "4h" else timeframe
        candles = normalize_candles(rows, ticker=ticker, timeframe=norm_tf)
        if timeframe == "4h":
            return aggregate_candles(candles, bucket_minutes=240, out_timeframe="4h")
        return candles

    def _get_chart(self, yahoo_symbol: str, params: dict[str, str]) -> httpx.Response:
        injected = self._client is not None
        client = self._get_client()
        path = f"/v8/finance/chart/{yahoo_symbol}"
        response = client.get(path, params=params)
        if response.status_code in (401, 403) and not injected:
            crumb = self._fetch_crumb(client)
            if crumb:
                params = {**params, "crumb": crumb}
                response = client.get(path, params=params)
            if response.status_code in (401, 403):
                alt = httpx.Client(
                    base_url="https://query2.finance.yahoo.com",
                    timeout=30.0,
                    headers=dict(client.headers),
                    cookies=client.cookies,
                )
                try:
                    response = alt.get(path, params=params)
                finally:
                    alt.close()
        return response

    def _fetch_crumb(self, client: httpx.Client) -> str:
        try:
            client.get("https://fc.yahoo.com")
            crumb_res = client.get("/v1/test/getcrumb")
        except httpx.HTTPError:
            return ""
        if crumb_res.status_code != 200 or not crumb_res.text:
            return ""
        return crumb_res.text.strip().strip('"')


def extract_yahoo_candles(payload: Any) -> list[dict[str, Any]]:
    chart = payload.get("chart") if isinstance(payload, dict) else None
    if not isinstance(chart, dict):
        raise ProviderError("yahoo chart payload missing")
    err = chart.get("error")
    if err:
        raise ProviderError(f"yahoo: {err.get('description') or err.get('code') or err}")
    results = chart.get("result") or []
    if not results:
        return []
    result = results[0]
    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []
    rows: list[dict[str, Any]] = []
    for i, ts in enumerate(timestamps):
        o = _at(opens, i)
        h = _at(highs, i)
        lo = _at(lows, i)
        c = _at(closes, i)
        if o is None or h is None or lo is None or c is None:
            continue
        rows.append(
            {
                "timestamp": datetime.fromtimestamp(int(ts), tz=UTC),
                "open": o,
                "high": h,
                "low": lo,
                "close": c,
                "volume": _at(volumes, i) or 0,
            }
        )
    return rows


def _at(series: list[Any], index: int) -> Any:
    if index >= len(series):
        return None
    return series[index]


def _aware(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=UTC)
    return ts.astimezone(UTC)

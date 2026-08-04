"""DynamoDB repositories for instruments, candles, strategies, runs, trades."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from boto3.dynamodb.conditions import Key

from app.core.constants import MVP_INSTRUMENTS, STRATEGY_ORB
from app.domain.candles import Candle as DomainCandle
from app.infrastructure.dynamo import client as ddb
from app.strategies.opening_range_breakout import OpeningRangeBreakoutStrategy


def _dec(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _iso(ts: datetime) -> str:
    return ts.isoformat()


class DynamoStore:
    """Persistence used when STORAGE_BACKEND=dynamodb."""

    def seed_defaults(self) -> dict[str, int]:
        instruments = 0
        for row in MVP_INSTRUMENTS:
            pk = f"{row['symbol']}#{row['market_type']}"
            existing = ddb.instruments_table().get_item(Key={"pk": pk}).get("Item")
            if existing:
                continue
            ddb.put_item(
                ddb.instruments_table(),
                {
                    "pk": pk,
                    "symbol": row["symbol"],
                    "name": row["name"],
                    "market_type": row["market_type"],
                    "data_provider": row["data_provider"],
                    "active": True,
                },
            )
            instruments += 1

        strategies = 0
        orb = OpeningRangeBreakoutStrategy()
        existing = ddb.strategies_table().get_item(Key={"pk": STRATEGY_ORB}).get("Item")
        if not existing:
            ddb.put_item(
                ddb.strategies_table(),
                {
                    "pk": STRATEGY_ORB,
                    "name": orb.name,
                    "description": orb.description,
                    "version": "1.0.0",
                    "parameters": orb.default_parameters,
                    "status": "active",
                },
            )
            strategies = 1
        return {"instruments": instruments, "strategies": strategies}

    def list_instruments(self) -> list[dict[str, Any]]:
        resp = ddb.instruments_table().scan()
        items = [i for i in resp.get("Items", []) if i.get("active", True)]
        return sorted(items, key=lambda x: x.get("symbol", ""))

    def get_instrument(self, symbol: str, market_type: str | None = None) -> dict[str, Any]:
        if market_type:
            item = (
                ddb.instruments_table()
                .get_item(Key={"pk": f"{symbol}#{market_type}"})
                .get("Item")
            )
            if not item:
                raise LookupError(f"Instrument not found: {symbol}/{market_type}")
            return item

        matches = [
            i
            for i in self.list_instruments()
            if i.get("symbol") == symbol and i.get("active", True)
        ]
        if not matches:
            raise LookupError(f"Instrument not found: {symbol}")
        if len(matches) > 1:
            raise LookupError(
                f"Ambiguous symbol {symbol}; pass market_type "
                f"(found {[m.get('market_type') for m in matches]})"
            )
        return matches[0]

    def save_candles(
        self,
        symbol: str,
        market_type: str,
        timeframe: str,
        candles: list[DomainCandle],
    ) -> int:
        tbl = ddb.candles_table()
        pk = f"{symbol}#{market_type}#{timeframe}"
        written = 0
        with tbl.batch_writer() as batch:
            for c in candles:
                batch.put_item(
                    Item={
                        "pk": pk,
                        "sk": _iso(c.timestamp),
                        "symbol": symbol,
                        "market_type": market_type,
                        "timeframe": timeframe,
                        "timestamp": _iso(c.timestamp),
                        "open": _dec(c.open),
                        "high": _dec(c.high),
                        "low": _dec(c.low),
                        "close": _dec(c.close),
                        "volume": _dec(c.volume),
                    }
                )
                written += 1
        return written

    def get_candles_by_range(
        self,
        symbol: str,
        market_type: str,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> list[DomainCandle]:
        pk = f"{symbol}#{market_type}#{timeframe}"
        resp = ddb.candles_table().query(
            KeyConditionExpression=Key("pk").eq(pk)
            & Key("sk").between(_iso(start), _iso(end))
        )
        items = sorted(resp.get("Items", []), key=lambda x: x["sk"])
        out: list[DomainCandle] = []
        for i in items:
            out.append(
                DomainCandle(
                    timestamp=datetime.fromisoformat(i["timestamp"]),
                    open=_dec(i["open"]),
                    high=_dec(i["high"]),
                    low=_dec(i["low"]),
                    close=_dec(i["close"]),
                    volume=_dec(i["volume"]),
                    ticker=symbol,
                    timeframe=timeframe,
                )
            )
        return out

    def list_strategy_rows(self) -> list[dict[str, Any]]:
        resp = ddb.strategies_table().scan()
        return list(resp.get("Items", []))

    def save_backtest_run(
        self,
        *,
        strategy: str,
        symbol: str,
        market_type: str,
        timeframe: str,
        start_date: date,
        end_date: date,
        parameters: dict[str, Any],
        metrics: dict[str, Any],
        trades: list[dict[str, Any]],
    ) -> str:
        run_id = str(uuid.uuid4())
        ddb.put_item(
            ddb.backtest_runs_table(),
            {
                "pk": run_id,
                "strategy": strategy,
                "symbol": symbol,
                "market_type": market_type,
                "timeframe": timeframe,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "parameters": parameters,
                "metrics": metrics,
                "status": "completed",
            },
        )
        tbl = ddb.trades_table()
        with tbl.batch_writer() as batch:
            for idx, t in enumerate(trades):
                batch.put_item(Item={"pk": run_id, "sk": f"{idx:05d}", **t})
        return run_id

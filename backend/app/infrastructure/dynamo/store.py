"""DynamoDB repositories for instruments, candles, strategies, runs, trades."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
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


def _dynamo_safe(value: Any) -> Any:
    """Recursively convert floats so DynamoDB TypeSerializer accepts the item."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _dynamo_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_dynamo_safe(v) for v in value]
    return value


def _iso(ts: datetime) -> str:
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=UTC)
    return ts.astimezone(UTC).isoformat()


def _parse_ts(value: str) -> datetime:
    text = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


class DynamoStore:
    """Persistence used when STORAGE_BACKEND=dynamodb."""

    def seed_defaults(self) -> dict[str, int]:
        """Upsert MVP instruments as active; deactivate Schwab symbols no longer in MVP."""
        instruments = 0
        desired = {
            (row["symbol"], row["market_type"]): row for row in MVP_INSTRUMENTS
        }
        for row in MVP_INSTRUMENTS:
            pk = f"{row['symbol']}#{row['market_type']}"
            existing = ddb.instruments_table().get_item(Key={"pk": pk}).get("Item")
            if existing:
                # Keep row current (name / active) when already present
                if (
                    existing.get("active") is not True
                    or existing.get("name") != row["name"]
                    or existing.get("data_provider") != row["data_provider"]
                ):
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

        # Soft-remove symbols dropped from MVP without deleting candle history
        resp = ddb.instruments_table().scan()
        for item in resp.get("Items", []):
            key = (item.get("symbol"), item.get("market_type"))
            if key in desired:
                continue
            if item.get("active") is False:
                continue
            item["active"] = False
            ddb.put_item(ddb.instruments_table(), item)
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
                    timestamp=_parse_ts(i["timestamp"]),
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
            _dynamo_safe(
                {
                    "pk": run_id,
                    "strategy": strategy,
                    "symbol": symbol,
                    "market_type": market_type,
                    "timeframe": timeframe,
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "parameters": parameters or {},
                    "metrics": metrics,
                    "status": "completed",
                }
            ),
        )
        tbl = ddb.trades_table()
        with tbl.batch_writer() as batch:
            for idx, t in enumerate(trades):
                batch.put_item(
                    Item=_dynamo_safe({"pk": run_id, "sk": f"{idx:05d}", **t})
                )
        return run_id

    def save_premarket_run(self, payload: dict[str, Any]) -> str:
        run_id = str(payload.get("run_id") or uuid.uuid4())
        ddb.put_item(
            ddb.backtest_runs_table(),
            _dynamo_safe(
                {
                    "pk": f"premarket#{run_id}",
                    "kind": "premarket",
                    "run_id": run_id,
                    "payload": payload,
                }
            ),
        )
        ddb.put_item(
            ddb.backtest_runs_table(),
            {
                "pk": "premarket#latest",
                "kind": "premarket_pointer",
                "run_id": run_id,
            },
        )
        return run_id

    def get_premarket_run(self, *, run_id: str | None = None) -> dict[str, Any] | None:
        tbl = ddb.backtest_runs_table()
        if not run_id:
            pointer = tbl.get_item(Key={"pk": "premarket#latest"}).get("Item")
            if not pointer:
                return None
            run_id = str(pointer.get("run_id") or "")
            if not run_id:
                return None

        item = tbl.get_item(Key={"pk": f"premarket#{run_id}"}).get("Item")
        if not item:
            return None
        payload = item.get("payload")
        return payload if isinstance(payload, dict) else None

"""DynamoDB access helpers for the cheap serverless stack."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key


@lru_cache
def get_dynamodb_resource():
    return boto3.resource("dynamodb")


def table(name_env: str):
    table_name = os.environ[name_env]
    return get_dynamodb_resource().Table(table_name)


def instruments_table():
    return table("TABLE_INSTRUMENTS")


def candles_table():
    return table("TABLE_CANDLES")


def strategies_table():
    return table("TABLE_STRATEGIES")


def backtest_runs_table():
    return table("TABLE_BACKTEST_RUNS")


def trades_table():
    return table("TABLE_TRADES")


def put_item(tbl, item: dict[str, Any]) -> None:
    tbl.put_item(Item=item)


__all__ = [
    "Key",
    "backtest_runs_table",
    "candles_table",
    "get_dynamodb_resource",
    "instruments_table",
    "put_item",
    "strategies_table",
    "trades_table",
]

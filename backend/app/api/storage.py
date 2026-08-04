"""Storage backend switch (sql local/RDS vs dynamodb cheap SAM)."""

from functools import lru_cache

from app.core.storage_backend import using_dynamo
from app.infrastructure.dynamo.store import DynamoStore


@lru_cache
def get_dynamo_store() -> DynamoStore:
    return DynamoStore()


__all__ = ["get_dynamo_store", "using_dynamo"]

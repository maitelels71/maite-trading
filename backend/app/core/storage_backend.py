"""Storage backend flag (avoid circular imports with database.session)."""

from app.core.config import settings


def using_dynamo() -> bool:
    return settings.storage_backend.lower() in {"dynamodb", "dynamo"}

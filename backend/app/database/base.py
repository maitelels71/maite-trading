"""SQLAlchemy declarative base (models arrive in Prompt 3)."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared metadata base for all ORM models."""

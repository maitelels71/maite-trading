"""Database engine and session factory."""

from collections.abc import Generator
from urllib.parse import quote_plus

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def get_database_url() -> str:
    """Prefer DATABASE_URL; otherwise compose from discrete RDS-style vars."""
    if settings.database_host:
        user = quote_plus(settings.database_user)
        password = quote_plus(settings.database_password)
        host = settings.database_host
        port = settings.database_port or "5432"
        name = settings.database_name or "maite_trading"
        return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{name}"
    return settings.database_url


def get_engine(*, echo: bool | None = None) -> Engine:
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_engine(
            get_database_url(),
            pool_pre_ping=True,
            future=True,
            echo=False if echo is None else echo,
        )
        _SessionLocal = sessionmaker(
            bind=_engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
    return _engine


def reset_engine() -> None:
    """Dispose engine — useful in tests."""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


def get_session_factory() -> sessionmaker[Session]:
    get_engine()
    assert _SessionLocal is not None
    return _SessionLocal


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency — yields a request-scoped SQLAlchemy session."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()

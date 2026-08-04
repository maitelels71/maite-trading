"""FastAPI application entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.database.base import Base
from app.database.seed import seed_all
from app.database.session import get_engine, session_scope

# Ensure models are registered on Base.metadata
import app.models  # noqa: F401

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging()
    engine = get_engine()
    # Dev convenience: create tables when using sqlite / fresh local DBs
    if settings.app_env in {"development", "test"} or settings.database_url.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)
        with session_scope() as session:
            counts = seed_all(session)
            logger.info("seeded database: %s", counts)
    logger.info("starting %s (%s)", settings.app_name, settings.app_env)
    yield
    logger.info("shutdown complete")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)
    return app


app = create_app()

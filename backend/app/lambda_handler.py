"""AWS Lambda entrypoint — wraps FastAPI with Mangum."""

import os

from mangum import Mangum

from app.main import app

# HTTP API includes the stage in rawPath (e.g. /staging/health).
# Strip it so FastAPI routes like /health resolve correctly.
_stage = (os.getenv("ENVIRONMENT") or "").strip().strip("/")
_base_path = f"/{_stage}" if _stage else None

handler = Mangum(
    app,
    lifespan="off",
    api_gateway_base_path=_base_path,
)

"""AWS Lambda entrypoint — wraps FastAPI with Mangum."""

import os

# Load Secrets Manager into os.environ BEFORE any Settings singleton is built.
# Important: do not import app.core (package) first — its __init__ used to pull settings early.
from app.core.secrets_loader import load_app_secrets_into_env

load_app_secrets_into_env()

from app.core.config import get_settings
import app.core.config as config_mod

get_settings.cache_clear()
config_mod.settings = get_settings()

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

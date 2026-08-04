"""AWS Lambda entrypoint — wraps FastAPI with Mangum."""

from mangum import Mangum

from app.main import app

handler = Mangum(app, lifespan="off")

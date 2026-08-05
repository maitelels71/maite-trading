"""Load broker/app secrets from AWS Secrets Manager into process env (Lambda)."""

from __future__ import annotations

import json
import logging
import os

logger = logging.getLogger(__name__)


def load_app_secrets_into_env() -> None:
    """Merge Secrets Manager JSON into os.environ before Settings is constructed.

    Only fills keys that are missing or empty so explicit Lambda env vars still win.
    """
    arn = (os.getenv("APP_SECRETS_ARN") or "").strip()
    if not arn:
        return

    try:
        import boto3

        client = boto3.client("secretsmanager")
        raw = client.get_secret_value(SecretId=arn).get("SecretString") or "{}"
        data = json.loads(raw)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to load APP_SECRETS_ARN=%s", arn)
        return

    if not isinstance(data, dict):
        logger.warning("Secret %s is not a JSON object", arn)
        return

    loaded = 0
    for key, value in data.items():
        if value is None:
            continue
        text = str(value).strip()
        if not text:
            continue
        current = (os.environ.get(str(key)) or "").strip()
        if current:
            continue
        os.environ[str(key)] = text
        loaded += 1

    if loaded:
        print(f"secrets_loader: loaded {loaded} keys into environment", flush=True)
    else:
        print("secrets_loader: no new keys loaded (missing ARN, empty secret, or already set)", flush=True)

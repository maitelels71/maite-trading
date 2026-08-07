"""Restore staging app secret fields from local .env + Schwab token file.

Merges into maite-trading/staging/app without printing secret values.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / ".env"
TOKEN_PATH = ROOT / ".secrets" / "schwab_token.json"
SECRET_ID = "maite-trading/staging/app"
REGION = "us-east-1"

KEYS = (
    "SCHWAB_CLIENT_ID",
    "SCHWAB_CLIENT_SECRET",
    "SCHWAB_REDIRECT_URI",
    "FINNHUB_API_KEY",
    "TRADEADVOCATE_API_KEY",
    "TRADEADVOCATE_API_SECRET",
    "TRADEADVOCATE_BASE_URL",
    "TRADEADVOCATE_ACCOUNT_ID",
)


def _env_value(text: str, key: str) -> str | None:
    match = re.search(rf"^{re.escape(key)}=(.*)$", text, flags=re.M)
    if not match:
        return None
    return match.group(1).strip().strip('"').strip("'")


def main() -> int:
    if not ENV_PATH.is_file():
        print(f"Missing {ENV_PATH}", file=sys.stderr)
        return 1

    env_text = ENV_PATH.read_text(encoding="utf-8")
    current = subprocess.check_output(
        [
            "aws",
            "secretsmanager",
            "get-secret-value",
            "--secret-id",
            SECRET_ID,
            "--query",
            "SecretString",
            "--output",
            "text",
            "--region",
            REGION,
        ],
        text=True,
    )
    data = json.loads(current)
    updated: list[str] = []
    for key in KEYS:
        value = _env_value(env_text, key)
        if value:
            data[key] = value
            updated.append(key)

    # Staging Admin OAuth callback (must match Schwab developer portal Callback URL)
    staging_callback = (
        "https://yix45u6ia8.execute-api.us-east-1.amazonaws.com/staging/admin/schwab/callback"
    )
    data["SCHWAB_REDIRECT_URI"] = staging_callback
    if "SCHWAB_REDIRECT_URI" not in updated:
        updated.append("SCHWAB_REDIRECT_URI")
    else:
        # still force staging callback for this secret
        pass

    if TOKEN_PATH.is_file():
        token = json.loads(TOKEN_PATH.read_text(encoding="utf-8"))
        if token.get("access_token") and token.get("refresh_token"):
            data["SCHWAB_TOKEN_JSON"] = json.dumps(token)
            updated.append("SCHWAB_TOKEN_JSON")

    subprocess.check_call(
        [
            "aws",
            "secretsmanager",
            "put-secret-value",
            "--secret-id",
            SECRET_ID,
            "--secret-string",
            json.dumps(data),
            "--region",
            REGION,
        ]
    )
    print("SECRET_RESTORED fields=", ",".join(updated))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

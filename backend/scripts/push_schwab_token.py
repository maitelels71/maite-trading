"""Push local Schwab OAuth token into staging Secrets Manager.

Reads `.secrets/schwab_token.json` and merges `SCHWAB_TOKEN_JSON` into
`maite-trading/staging/app` so Lambda can refresh/call Schwab APIs.

Usage (from backend/):

  .\\.venv\\Scripts\\python.exe -m scripts.push_schwab_token
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOKEN_PATH = ROOT / ".secrets" / "schwab_token.json"
SECRET_ID = "maite-trading/staging/app"
REGION = "us-east-1"


def main() -> int:
    if not TOKEN_PATH.is_file():
        print(f"Missing token file: {TOKEN_PATH}", file=sys.stderr)
        print("Run: python -m scripts.schwab_login", file=sys.stderr)
        return 1

    token = json.loads(TOKEN_PATH.read_text(encoding="utf-8"))
    if not token.get("access_token") or not token.get("refresh_token"):
        print("Token file missing access_token or refresh_token", file=sys.stderr)
        return 1

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
    data["SCHWAB_TOKEN_JSON"] = json.dumps(token)
    # Ensure client fields stay present if already set locally in secret
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
    print(
        "SECRET_OK schwab_token keys=",
        ",".join(sorted(token.keys())),
        "secret_keys=",
        ",".join(sorted(data.keys())),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

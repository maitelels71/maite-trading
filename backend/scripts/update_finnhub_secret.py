"""One-shot: merge FINNHUB_API_KEY from repo .env into staging Secrets Manager."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / ".env"
SECRET_ID = "maite-trading/staging/app"
REGION = "us-east-1"


def main() -> int:
    text = ENV_PATH.read_text(encoding="utf-8")
    match = re.search(r"^FINNHUB_API_KEY=(.*)$", text, flags=re.M)
    if not match:
        print("FINNHUB_API_KEY missing in .env", file=sys.stderr)
        return 1
    key = match.group(1).strip().strip('"').strip("'")
    if len(key) < 8:
        print("FINNHUB_API_KEY too short", file=sys.stderr)
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
    data["FINNHUB_API_KEY"] = key
    payload = json.dumps(data)
    subprocess.check_call(
        [
            "aws",
            "secretsmanager",
            "put-secret-value",
            "--secret-id",
            SECRET_ID,
            "--secret-string",
            payload,
            "--region",
            REGION,
        ]
    )
    print("SECRET_OK finnhub_len=", len(key), "keys=", ",".join(sorted(data.keys())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Merge SMS_ALERT_PHONE into staging Secrets Manager.

Usage:
  python -m scripts.update_sms_secret +18135551212
"""

from __future__ import annotations

import json
import subprocess
import sys

SECRET_ID = "maite-trading/staging/app"
REGION = "us-east-1"


def main() -> int:
    phone = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
    if not phone.startswith("+") or len(phone) < 11:
        print("Usage: python -m scripts.update_sms_secret +1XXXXXXXXXX", file=sys.stderr)
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
    data["SMS_ALERT_PHONE"] = phone
    data["SMS_ALERTS_ENABLED"] = "true"
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
    print("SECRET_OK SMS_ALERT_PHONE set, keys=", ",".join(sorted(data.keys())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

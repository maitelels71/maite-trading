"""Merge Gmail alert settings into staging Secrets Manager.

Usage:
  python -m scripts.update_gmail_secret --to maylels@gmail.com --app-password "xxxx xxxx xxxx xxxx"

Optional: --from (defaults to --to), --user (defaults to --to)
Also clears Twilio SMS as the primary channel (keeps keys but sets ALERT_EMAIL_TO).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys

SECRET_ID = "maite-trading/staging/app"
REGION = "us-east-1"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--to", required=True, help="Alert destination Gmail")
    parser.add_argument("--app-password", required=True, help="Google App Password")
    parser.add_argument("--from", dest="from_addr", default="")
    parser.add_argument("--user", default="")
    args = parser.parse_args()

    to_addr = args.to.strip()
    app_password = args.app_password.strip().replace(" ", "")
    user = (args.user or to_addr).strip()
    from_addr = (args.from_addr or to_addr).strip()
    if "@" not in to_addr or len(app_password) < 12:
        print("Need a valid --to email and Google App Password", file=sys.stderr)
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
    data["ALERT_EMAIL_TO"] = to_addr
    data["ALERT_EMAIL_FROM"] = from_addr
    data["GMAIL_USER"] = user
    data["GMAIL_APP_PASSWORD"] = app_password
    data["SMS_ALERTS_ENABLED"] = "true"
    # Prefer email: leave phone empty so SMS path is unused
    data["SMS_ALERT_PHONE"] = ""
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
    print("SECRET_OK gmail alerts set for", to_addr, "keys=", ",".join(sorted(data.keys())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Merge Twilio + SMS alert phone into staging Secrets Manager.

Usage (do not commit tokens):
  python -m scripts.update_twilio_secret \\
    --sid ACxxxx --token xxxx --from +14125551212 --to +18135551212
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
    parser.add_argument("--sid", required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--from", dest="from_number", required=True)
    parser.add_argument("--to", dest="to_number", required=True)
    args = parser.parse_args()

    sid = args.sid.strip()
    token = args.token.strip()
    from_number = args.from_number.strip()
    to_number = args.to_number.strip()
    if not sid.startswith("AC") or len(token) < 10:
        print("Invalid Twilio SID/token", file=sys.stderr)
        return 1
    if not from_number.startswith("+") or not to_number.startswith("+"):
        print("From/To must be E.164 (+1…)", file=sys.stderr)
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
    data["TWILIO_ACCOUNT_SID"] = sid
    data["TWILIO_AUTH_TOKEN"] = token
    data["TWILIO_FROM_NUMBER"] = from_number
    data["SMS_ALERT_PHONE"] = to_number
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
    print(
        "SECRET_OK twilio+sms set, keys=",
        ",".join(sorted(data.keys())),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

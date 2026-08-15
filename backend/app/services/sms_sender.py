"""SMS sender — Twilio preferred; SNS fallback."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class SmsSendError(RuntimeError):
    """SMS publish failed."""


def publish_sms(
    phone: str,
    message: str,
    *,
    client: Any | None = None,
) -> str:
    """Send one SMS. Returns provider message id (or 'dry-run')."""
    number = str(phone or "").strip()
    text = str(message or "").strip()
    if not number or not text:
        raise SmsSendError("phone and message are required")
    if client == "dry-run":
        logger.info("SMS dry-run → %s: %s", number, text)
        return "dry-run"

    # Explicit client: Twilio-like (.messages.create) or SNS (.publish)
    if client is not None and hasattr(client, "messages"):
        return _publish_twilio_client(client, number, text)
    if client is not None and hasattr(client, "publish"):
        return _publish_sns(number, text, client=client)

    sid = (settings.twilio_account_sid or "").strip()
    token = (settings.twilio_auth_token or "").strip()
    from_num = (settings.twilio_from_number or "").strip()
    if sid and token and from_num:
        return _publish_twilio_http(sid, token, from_num, number, text)

    return _publish_sns(number, text, client=None)


def _publish_twilio_client(client: Any, to: str, body: str) -> str:
    try:
        msg = client.messages.create(
            to=to,
            from_=(settings.twilio_from_number or "").strip() or None,
            body=body,
        )
    except Exception as exc:  # noqa: BLE001
        raise SmsSendError(str(exc)) from exc
    mid = str(getattr(msg, "sid", None) or getattr(msg, "MessageId", "") or "")
    logger.info("Twilio SMS sent id=%s to %s", mid, to)
    return mid


def _publish_twilio_http(
    account_sid: str,
    auth_token: str,
    from_number: str,
    to: str,
    body: str,
) -> str:
    url = (
        f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    )
    try:
        resp = httpx.post(
            url,
            data={"To": to, "From": from_number, "Body": body},
            auth=(account_sid, auth_token),
            timeout=30.0,
        )
    except Exception as exc:  # noqa: BLE001
        raise SmsSendError(str(exc)) from exc
    if resp.status_code >= 400:
        raise SmsSendError(f"Twilio {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    mid = str(data.get("sid") or "")
    logger.info("Twilio SMS sent id=%s to %s", mid, to)
    return mid


def _publish_sns(phone: str, message: str, *, client: Any | None) -> str:
    sns = client
    if sns is None:
        import boto3

        sns = boto3.client("sns")
    try:
        resp = sns.publish(
            PhoneNumber=phone,
            Message=message,
            MessageAttributes={
                "AWS.SNS.SMS.SMSType": {
                    "DataType": "String",
                    "StringValue": "Transactional",
                }
            },
        )
    except Exception as exc:  # noqa: BLE001
        raise SmsSendError(str(exc)) from exc
    mid = str(resp.get("MessageId") or "")
    logger.info("SNS SMS sent id=%s to %s", mid, phone)
    return mid

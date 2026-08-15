"""Amazon SNS SMS sender."""

from __future__ import annotations

from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)


class SmsSendError(RuntimeError):
    """SNS publish failed."""


def publish_sms(
    phone: str,
    message: str,
    *,
    client: Any | None = None,
) -> str:
    """Send one transactional SMS. Returns SNS MessageId (or 'dry-run')."""
    number = str(phone or "").strip()
    text = str(message or "").strip()
    if not number or not text:
        raise SmsSendError("phone and message are required")
    if client == "dry-run":
        logger.info("SMS dry-run → %s: %s", number, text)
        return "dry-run"

    sns = client
    if sns is None:
        import boto3

        sns = boto3.client("sns")
    try:
        resp = sns.publish(
            PhoneNumber=number,
            Message=text,
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
    logger.info("SMS sent id=%s to %s", mid, number)
    return mid

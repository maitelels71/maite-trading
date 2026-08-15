"""Send alert emails via Gmail SMTP (App Password)."""

from __future__ import annotations

import smtplib
from email.message import EmailMessage
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class EmailSendError(RuntimeError):
    """Email publish failed."""


def publish_email(
    to_addr: str,
    subject: str,
    body: str,
    *,
    client: Any | None = None,
) -> str:
    """Send one email. Returns 'dry-run', 'ok', or a provider id."""
    to = str(to_addr or "").strip()
    subj = str(subject or "").strip()
    text = str(body or "").strip()
    if not to or not text:
        raise EmailSendError("to and body are required")
    if client == "dry-run":
        logger.info("Email dry-run → %s: %s", to, subj)
        return "dry-run"

    user = (settings.gmail_user or "").strip()
    password = (settings.gmail_app_password or "").strip()
    from_addr = (settings.alert_email_from or user or "").strip()
    if not user or not password or not from_addr:
        raise EmailSendError(
            "GMAIL_USER, GMAIL_APP_PASSWORD, and ALERT_EMAIL_FROM (or GMAIL_USER) required"
        )

    msg = EmailMessage()
    msg["Subject"] = subj or "Maite trading alert"
    msg["From"] = from_addr
    msg["To"] = to
    msg.set_content(text)

    if client is not None:
        # Test double: expects .send_message(msg)
        client.send_message(msg)
        return "ok"

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as smtp:
            smtp.starttls()
            smtp.login(user, password)
            smtp.send_message(msg)
    except Exception as exc:  # noqa: BLE001
        raise EmailSendError(str(exc)) from exc

    logger.info("Email sent to %s subject=%s", to, subj)
    return "ok"

"""Structured logging helpers."""

from __future__ import annotations

import logging
import sys
from typing import Optional

from app.core.config import get_settings


def configure_logging(level: Optional[str] = None) -> None:
    settings = get_settings()
    log_level = (level or settings.log_level).upper()
    root = logging.getLogger()
    if root.handlers:
        root.setLevel(log_level)
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    root.addHandler(handler)
    root.setLevel(log_level)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)

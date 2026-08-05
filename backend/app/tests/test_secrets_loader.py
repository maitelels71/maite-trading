"""Unit tests for Secrets Manager → env bootstrap."""

from __future__ import annotations

import json

from app.core.secrets_loader import load_app_secrets_into_env


def test_load_app_secrets_into_env(monkeypatch) -> None:
    class FakeClient:
        def get_secret_value(self, SecretId: str):  # noqa: N803
            assert SecretId == "arn:aws:secretsmanager:us-east-1:1:secret:x"
            return {
                "SecretString": json.dumps(
                    {
                        "FINNHUB_API_KEY": "abc123",
                        "EMPTY": "",
                        "ALREADY": "keep-me",
                    }
                )
            }

    class FakeBoto3:
        def client(self, _name: str):
            return FakeClient()

    monkeypatch.setenv("APP_SECRETS_ARN", "arn:aws:secretsmanager:us-east-1:1:secret:x")
    monkeypatch.setenv("ALREADY", "keep-me")
    monkeypatch.delenv("FINNHUB_API_KEY", raising=False)
    monkeypatch.setitem(__import__("sys").modules, "boto3", FakeBoto3())

    load_app_secrets_into_env()

    import os

    assert os.environ["FINNHUB_API_KEY"] == "abc123"
    assert os.environ["ALREADY"] == "keep-me"
    assert "EMPTY" not in os.environ or os.environ.get("EMPTY") == ""

"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py → repo root and backend/
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Root .env (where you put FINNHUB) + optional backend/.env
        env_file=(_REPO_ROOT / ".env", _BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Maite Trading Strategy Analyzer"
    app_version: str = "0.1.0"
    environment: str = "local"
    debug: bool = True

    # Comma-separated origins; parsed below
    cors_origins_raw: str = Field(
        default="http://localhost:3000",
        alias="CORS_ORIGINS",
    )

    # Database — local Postgres OR AWS RDS (preferred for shared/staging)
    # On AWS, App Runner receives DATABASE_HOST / DATABASE_SECRET_ARN from CloudFormation.
    database_url: str = Field(
        default="postgresql+psycopg://maite:maite@localhost:5432/maite_trading",
        alias="DATABASE_URL",
    )
    # Discrete RDS-style vars (App Runner / Secrets Manager wiring)
    database_host: str = Field(default="", alias="DATABASE_HOST")
    database_port: str = Field(default="5432", alias="DATABASE_PORT")
    database_name: str = Field(default="maite_trading", alias="DATABASE_NAME")
    database_user: str = Field(default="maite", alias="DATABASE_USER")
    database_password: str = Field(default="", alias="DATABASE_PASSWORD")
    database_secret_arn: str = Field(default="", alias="DATABASE_SECRET_ARN")
    app_secrets_arn: str = Field(default="", alias="APP_SECRETS_ARN")

    # sql = local/Postgres path; dynamodb = cheap SAM stack
    storage_backend: str = Field(default="sql", alias="STORAGE_BACKEND")

    # Charles Schwab OAuth2 (equities / ETFs)
    schwab_client_id: str = Field(default="", alias="SCHWAB_CLIENT_ID")
    schwab_client_secret: str = Field(default="", alias="SCHWAB_CLIENT_SECRET")
    schwab_redirect_uri: str = Field(
        default="https://127.0.0.1:8182",
        alias="SCHWAB_REDIRECT_URI",
    )
    schwab_token_path: str = Field(
        default=".secrets/schwab_token.json",
        alias="SCHWAB_TOKEN_PATH",
    )
    # Optional JSON blob (Secrets Manager / Lambda). Same shape as the token file.
    schwab_token_json: str = Field(default="", alias="SCHWAB_TOKEN_JSON")
    # Live SELL_TO_CLOSE / equity SELL via Trader API (requires Accounts & Trading product).
    schwab_trading_enabled: bool = Field(default=True, alias="SCHWAB_TRADING_ENABLED")

    # TradeAdvocate (futures)
    tradeadvocate_api_key: str = Field(default="", alias="TRADEADVOCATE_API_KEY")
    tradeadvocate_api_secret: str = Field(
        default="",
        alias="TRADEADVOCATE_API_SECRET",
    )
    tradeadvocate_base_url: str = Field(
        default="",
        alias="TRADEADVOCATE_BASE_URL",
    )
    tradeadvocate_account_id: str = Field(
        default="",
        alias="TRADEADVOCATE_ACCOUNT_ID",
    )

    # Market news / economic calendar
    finnhub_api_key: str = Field(default="", alias="FINNHUB_API_KEY")
    # Free US macro calendar fallback (demo key works without signup)
    econpulse_api_key: str = Field(default="demo", alias="ECONPULSE_API_KEY")

    # Notion daily review + trade journal sync
    notion_api_key: str = Field(default="", alias="NOTION_API_KEY")
    notion_database_id: str = Field(default="", alias="NOTION_DATABASE_ID")
    notion_journal_database_id: str = Field(
        default="",
        alias="NOTION_JOURNAL_DATABASE_ID",
    )

    # SMS ready-to-enter alerts (Amazon SNS). Phone lives in Secrets Manager.
    sms_alert_phone: str = Field(default="", alias="SMS_ALERT_PHONE")
    sms_alerts_enabled: bool = Field(default=True, alias="SMS_ALERTS_ENABLED")

    # Market session defaults
    default_timezone: str = Field(
        default="America/New_York",
        alias="DEFAULT_TIMEZONE",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
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

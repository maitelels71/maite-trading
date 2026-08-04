"""Application configuration loaded from environment variables."""

from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Maite Trading Strategy Analyzer"
    app_env: str = Field(default="development", alias="APP_ENV")
    debug: bool = Field(default=True, alias="DEBUG")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    database_url: str = Field(
        default="sqlite+pysqlite:///:memory:",
        alias="DATABASE_URL",
    )

    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        alias="CORS_ORIGINS",
    )

    schwab_api_base_url: str = Field(
        default="https://api.schwabapi.com",
        alias="SCHWAB_API_BASE_URL",
    )
    schwab_client_id: str = Field(default="", alias="SCHWAB_CLIENT_ID")
    schwab_client_secret: str = Field(default="", alias="SCHWAB_CLIENT_SECRET")
    schwab_refresh_token: str = Field(default="", alias="SCHWAB_REFRESH_TOKEN")

    tradeadvocate_api_base_url: str = Field(
        default="https://api.tradeadvocate.com",
        alias="TRADEADVOCATE_API_BASE_URL",
    )
    tradeadvocate_api_key: str = Field(default="", alias="TRADEADVOCATE_API_KEY")

    use_mock_providers: bool = Field(default=True, alias="USE_MOCK_PROVIDERS")
    default_timezone: str = Field(default="America/New_York", alias="DEFAULT_TIMEZONE")
    default_opening_range_minutes: int = Field(
        default=5,
        alias="DEFAULT_OPENING_RANGE_MINUTES",
    )

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

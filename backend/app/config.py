"""Optional environment configuration matching the project specification template."""

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend settings; secrets remain optional for offline development and CI."""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    nvidia_api_key: str | None = None
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "nvidia/nemotron-3.5-lightning-30b-a3b"
    supabase_url: str | None = None
    supabase_jwks_url: str | None = None
    supabase_secret_key: str | None = None
    supabase_db_url: str | None = None
    at_username: str = "sandbox"
    at_api_key: str | None = None
    at_test_phone: str | None = None
    webhook_token: str | None = None
    at_ussd_service_code: str = ""
    at_allowed_phones: str = ""
    rate_limit_per_minute: int = Field(default=60, ge=1, le=10_000)
    app_env: str = "development"
    public_base_url: str | None = None
    allowed_origins: str = "http://localhost:5173"

    @field_validator("rate_limit_per_minute", mode="before")
    @classmethod
    def empty_rate_limit_uses_default(cls, value: object) -> object:
        """Allow an empty template value while retaining a safe default limit."""
        return 60 if value == "" else value

    @property
    def cors_origins(self) -> list[str]:
        """Return configured comma-separated CORS origins."""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


settings = Settings()

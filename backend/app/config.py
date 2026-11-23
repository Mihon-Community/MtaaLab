"""Optional environment configuration matching the project specification template."""

from pathlib import Path

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
    supabase_secret_key: str | None = None
    supabase_db_url: str | None = None
    at_username: str = "sandbox"
    at_api_key: str | None = None
    at_test_phone: str | None = None
    app_env: str = "development"
    public_base_url: str | None = None
    allowed_origins: str = "http://localhost:5173"

    @property
    def cors_origins(self) -> list[str]:
        """Return configured comma-separated CORS origins."""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


settings = Settings()

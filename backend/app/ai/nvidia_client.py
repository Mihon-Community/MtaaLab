"""NVIDIA NIM client configuration; TODO(owner): add bounded calls and fallback behavior."""

from openai import OpenAI

from app.config import settings


def create_nvidia_client() -> OpenAI | None:
    """Build a client only when a backend key is configured; model comes from settings."""
    if not settings.nvidia_api_key:
        return None
    return OpenAI(base_url=settings.nvidia_base_url, api_key=settings.nvidia_api_key, timeout=20.0)


def configured_model() -> str:
    """Return the environment-selected model ID; never hard-code it in call sites."""
    return settings.nvidia_model

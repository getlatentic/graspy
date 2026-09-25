from __future__ import annotations

import json
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# A Worker receives these as bindings on `env`, not in the process
# environment; worker.py copies exactly these across.
DEPLOYMENT_KEYS = (
    "APP_ENV",
    "CORS_ORIGINS",
    "PUBLIC_BASE_URL",
    "A2A_PATH_PREFIX",
    "SESSION_SECRET",
    "LLM_MODEL_ID",
    "AWS_REGION",
    "AWS_BEARER_TOKEN_BEDROCK",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # The project's .env, wherever the server is launched from.
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = Field(default="development", alias="APP_ENV")

    # Local serving only.
    host: str = "0.0.0.0"
    port: int = Field(default=8080, gt=0, lt=65536)
    uvicorn_reload: bool = False

    cors_origins: list[str] | None = None
    # The agent card advertises it, and the browser posts back to it.
    public_base_url: str = Field(
        default="http://localhost:8080", alias="PUBLIC_BASE_URL"
    )
    a2a_path_prefix: str = Field(default="/a2a", alias="A2A_PATH_PREFIX")

    session_secret: str | None = Field(default=None, alias="SESSION_SECRET")

    # A Bedrock mantle id, which carries no version suffix.
    llm_model_id: str = Field(default="openai.gpt-oss-120b", alias="LLM_MODEL_ID")
    aws_region: str = Field(default="us-east-1", alias="AWS_REGION")
    aws_bearer_token_bedrock: str | None = Field(
        default=None, alias="AWS_BEARER_TOKEN_BEDROCK"
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        """A comma-separated list or a JSON array."""
        if value is None or value == "":
            return None
        if not isinstance(value, str):
            return value
        if value.strip().startswith("["):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list):
                return [str(item) for item in parsed]
        return [item.strip() for item in value.split(",") if item.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}


def get_settings() -> Settings:
    return Settings()

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .llm.profiles import profile_named

logger = logging.getLogger(__name__)
_warned_of_region = False

# A Worker receives these as bindings on `env`, not in the process
# environment; worker.py copies exactly these across.
DEPLOYMENT_KEYS = (
    "APP_ENV",
    "CORS_ORIGINS",
    "PUBLIC_BASE_URL",
    "A2A_PATH_PREFIX",
    "SESSION_SECRET",
    "LLM_PROFILE",
    "LLM_HOST",
    "LLM_MODEL_ID",
    "LLM_BASE_URL",
    "LLM_BASE_URL_ALLOW",
    "LLM_NATIVE_TOOLS",
    "AWS_REGION",
    "AWS_BEARER_TOKEN_BEDROCK",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
    "FIREBASE_API_KEY",
    "FIREBASE_SERVICE_ACCOUNT",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # The project's .env, wherever the server is launched from.
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        # A validation error would otherwise print the whole input, keys included.
        hide_input_in_errors=True,
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

    # A named model (llm/profiles.py). LLM_HOST, LLM_MODEL_ID and LLM_BASE_URL,
    # when set, win over what it gives.
    llm_profile: str | None = Field(default=None, alias="LLM_PROFILE")
    llm_host: Literal["bedrock", "workers-ai"] = Field(
        default="bedrock", alias="LLM_HOST"
    )
    # Unset means the host's own gpt-oss-120b id.
    llm_model_id: str | None = Field(default=None, alias="LLM_MODEL_ID")
    # Unset means the host's default URL. Checked by llm/base_url.py.
    llm_base_url: str | None = Field(default=None, alias="LLM_BASE_URL")
    # The one host, beyond the model host's own, that LLM_BASE_URL may name.
    llm_base_url_allow: str | None = Field(default=None, alias="LLM_BASE_URL_ALLOW")
    # The tutor's tools travel as native tool calls, not as text in fields.
    llm_native_tools: bool = Field(default=False, alias="LLM_NATIVE_TOOLS")
    # Unused. Declared so that a leftover value, from the environment, the .env
    # file or a Worker var, is seen and warned of.
    aws_region: str | None = Field(default=None, alias="AWS_REGION")
    aws_bearer_token_bedrock: str | None = Field(
        default=None, alias="AWS_BEARER_TOKEN_BEDROCK"
    )
    cloudflare_account_id: str | None = Field(
        default=None, alias="CLOUDFLARE_ACCOUNT_ID"
    )
    cloudflare_api_token: str | None = Field(default=None, alias="CLOUDFLARE_API_TOKEN")
    # The Firebase project's web API key: public, but it names the project
    # whose sign-ins are accepted. Unset turns sign-in off.
    firebase_api_key: str | None = Field(default=None, alias="FIREBASE_API_KEY")
    # The key (JSON) of a service account that may delete Firebase users: deleting an account
    # removes the person's sign-in record too. A Worker secret.
    firebase_service_account: str | None = Field(
        default=None, alias="FIREBASE_SERVICE_ACCOUNT"
    )
    # host:port of Firebase's Auth emulator, which vouches for any sign-in.
    firebase_auth_emulator_host: str | None = Field(
        default=None, alias="FIREBASE_AUTH_EMULATOR_HOST"
    )

    @field_validator("llm_native_tools", mode="before")
    @classmethod
    def empty_native_tools_is_off(cls, value):
        """A binding left empty is off, not an error."""
        return False if isinstance(value, str) and not value.strip() else value

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
    def is_deployed(self) -> bool:
        """Production, or staging, which runs as production does so that what
        it shows holds there."""
        return self.app_env.lower() in {"production", "prod", "staging"}

    @field_validator("llm_profile")
    @classmethod
    def known_profile(cls, value):
        """Checked here, not after the model is built, so an error echoes only
        this value and never the keys beside it."""
        if value is not None and value.strip():
            profile_named(value.strip())
        return value

    @model_validator(mode="after")
    def warn_of_unused_region(self) -> Settings:
        """A deployment that still sets AWS_REGION keeps starting, once told."""
        global _warned_of_region
        if (self.aws_region or "").strip() and not _warned_of_region:
            _warned_of_region = True
            logger.warning(
                "AWS_REGION is set but unused: the Bedrock host and region come from "
                "LLM_BASE_URL (bedrock-mantle.<region>.api.aws) or LLM_PROFILE."
            )
        return self

    @model_validator(mode="after")
    def fill_from_profile(self) -> Settings:
        """What the profile names, for each LLM setting not given. A given
        LLM_HOST that is not the profile's host is refused: the profile's model
        and URL would reach another host's credentials."""
        if not self.llm_profile or not self.llm_profile.strip():
            return self
        name = self.llm_profile.strip()
        profile = profile_named(name)
        given = self.model_fields_set
        if "llm_host" in given and self.llm_host != profile.host:
            raise ValueError(
                f"LLM_PROFILE={name} runs on {profile.host} but LLM_HOST={self.llm_host}; "
                "unset one of them."
            )
        self.llm_host = profile.host
        for field, value in (
            ("llm_model_id", profile.model_id),
            ("llm_base_url", profile.base_url),
        ):
            if field not in given or not (getattr(self, field) or "").strip():
                setattr(self, field, value)
        return self

    @model_validator(mode="after")
    def no_emulator_when_deployed(self) -> Settings:
        if self.is_deployed and self.firebase_auth_emulator_host:
            raise ValueError(
                f"FIREBASE_AUTH_EMULATOR_HOST is set in {self.app_env}, where it "
                "would accept a sign-in nobody made."
            )
        return self

    @model_validator(mode="after")
    def sign_in_removable_when_deployed(self) -> Settings:
        """Deleting an account has to delete the sign-in record, or what the privacy notice
        says is false."""
        if (
            self.is_deployed
            and self.firebase_api_key
            and not self.firebase_service_account
        ):
            raise ValueError(
                f"FIREBASE_SERVICE_ACCOUNT is required in {self.app_env} while sign-in is on: "
                "without it a deleted account's email and name would stay in Firebase."
            )
        return self


def get_settings() -> Settings:
    return Settings()

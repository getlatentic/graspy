"""Where gpt-oss-120b is served: Amazon Bedrock by default, or Cloudflare
Workers AI. Both answer OpenAI Chat Completions, so one engine drives either."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from dspy.lm15 import RouterConfig

from ..settings import Settings
from .base_url import checked_base_url

HostName = Literal["bedrock", "workers-ai"]
URL_PROVIDER = "openai-chat"


@dataclass(frozen=True)
class Host:
    provider: str
    default_model: str
    required: tuple[str, ...]
    config: Callable[[Settings, object], RouterConfig]

    def provider_for(self, settings: Settings) -> str:
        """lm15 refuses a whole URL for a cloud door such as
        bedrock-mantle-chat, so a configured base URL goes through the plain
        OpenAI Chat provider, which sends the same bearer key."""
        return (
            URL_PROVIDER if checked_base_url(settings.llm_base_url) else self.provider
        )

    def model(self, settings: Settings) -> str:
        model_id = settings.llm_model_id or self.default_model
        routed = f"{self.provider_for(settings)}:"
        return model_id if model_id.startswith(routed) else routed + model_id

    def missing(self, settings: Settings) -> list[str]:
        return [key for key in self.required if not getattr(settings, key.lower())]


def _bedrock(settings: Settings, transport: object) -> RouterConfig:
    base_url = checked_base_url(settings.llm_base_url)
    if base_url:
        return RouterConfig(
            api_keys={URL_PROVIDER: settings.aws_bearer_token_bedrock},
            base_urls={URL_PROVIDER: base_url},
            transport=transport,
        )
    return RouterConfig(
        api_keys={"bedrock-mantle-chat": settings.aws_bearer_token_bedrock},
        settings={"bedrock-mantle-chat": {"region": settings.aws_region}},
        transport=transport,
    )


def _workers_ai(settings: Settings, transport: object) -> RouterConfig:
    account = settings.cloudflare_account_id
    default_url = f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1"
    return RouterConfig(
        api_keys={URL_PROVIDER: settings.cloudflare_api_token},
        base_urls={
            URL_PROVIDER: checked_base_url(settings.llm_base_url) or default_url
        },
        transport=transport,
    )


HOSTS: dict[HostName, Host] = {
    # Chat Completions on bedrock-mantle: the same wire on bedrock-runtime
    # inlines gpt-oss's reasoning into the answer, which then fails to parse.
    # Mantle ids carry no version suffix.
    "bedrock": Host(
        provider="bedrock-mantle-chat",
        default_model="openai.gpt-oss-120b",
        required=("AWS_BEARER_TOKEN_BEDROCK",),
        config=_bedrock,
    ),
    "workers-ai": Host(
        provider="openai-chat",
        default_model="@cf/openai/gpt-oss-120b",
        required=("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"),
        config=_workers_ai,
    ),
}


def host_of(settings: Settings) -> Host:
    host = HOSTS[settings.llm_host]
    checked_base_url(settings.llm_base_url)
    missing = host.missing(settings)
    if missing:
        raise RuntimeError(
            f"LLM_HOST={settings.llm_host} needs {' and '.join(missing)}."
        )
    return host

"""Where gpt-oss-120b is served: Amazon Bedrock by default, or Cloudflare
Workers AI. Both answer OpenAI Chat Completions, so one engine drives either."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from dspy.lm15 import RouterConfig

from ..settings import Settings

HostName = Literal["bedrock", "workers-ai"]


@dataclass(frozen=True)
class Host:
    provider: str
    default_model: str
    required: tuple[str, ...]
    config: Callable[[Settings, object], RouterConfig]

    def model(self, settings: Settings) -> str:
        model_id = settings.llm_model_id or self.default_model
        routed = f"{self.provider}:"
        return model_id if model_id.startswith(routed) else routed + model_id

    def missing(self, settings: Settings) -> list[str]:
        return [key for key in self.required if not getattr(settings, key.lower())]


def _bedrock(settings: Settings, transport: object) -> RouterConfig:
    return RouterConfig(
        api_keys={"bedrock-mantle-chat": settings.aws_bearer_token_bedrock},
        settings={"bedrock-mantle-chat": {"region": settings.aws_region}},
        transport=transport,
    )


def _workers_ai(settings: Settings, transport: object) -> RouterConfig:
    account = settings.cloudflare_account_id
    return RouterConfig(
        api_keys={"openai-chat": settings.cloudflare_api_token},
        base_urls={
            "openai-chat": f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1"
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
    missing = host.missing(settings)
    if missing:
        raise RuntimeError(
            f"LLM_HOST={settings.llm_host} needs {' and '.join(missing)}."
        )
    return host

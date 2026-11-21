"""Where gpt-oss-120b is served: Amazon Bedrock by default, or Cloudflare
Workers AI. Both answer OpenAI Chat Completions, so one engine drives either."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlsplit

# Not re-exported by dspy.lm15. DSPy is pinned exactly, and
# tests/test_llm_base_url.py fails if the default URL stops matching.
from dspy._vendor.lm15.access import BEDROCK_MANTLE_CHAT
from dspy._vendor.lm15.cloud.hosts import render_base_url
from dspy.lm15 import RouterConfig

from ..settings import Settings
from .base_url import checked_base_url
from .transport import RebasedTransport

HostName = Literal["bedrock", "workers-ai"]
OPENAI_CHAT = "openai-chat"


@dataclass(frozen=True)
class Host:
    provider: str
    default_model: str
    required: tuple[str, ...]
    config: Callable[[Settings, object], RouterConfig]
    # The hostnames its API key may be sent to; the first is the default.
    own_hosts: Callable[[Settings], tuple[str, ...]]

    def model(self, settings: Settings) -> str:
        model_id = settings.llm_model_id or self.default_model
        routed = f"{self.provider}:"
        return model_id if model_id.startswith(routed) else routed + model_id

    def missing(self, settings: Settings) -> list[str]:
        return [key for key in self.required if not getattr(settings, key.lower())]

    def base_url(self, settings: Settings) -> str | None:
        return checked_base_url(settings, self.own_hosts(settings))

    def endpoint(self, settings: Settings) -> str:
        """The hostname the requests go to."""
        url = self.base_url(settings)
        return urlsplit(url).hostname if url else self.own_hosts(settings)[0]


def _bedrock_hosts(settings: Settings) -> tuple[str, ...]:
    return (f"bedrock-mantle.{settings.aws_region}.api.aws",)


def _workers_ai_hosts(settings: Settings) -> tuple[str, ...]:
    return ("api.cloudflare.com", "gateway.ai.cloudflare.com")


def _bedrock(settings: Settings, transport: object) -> RouterConfig:
    base_url = checked_base_url(settings, _bedrock_hosts(settings))
    if base_url:
        default = render_base_url(
            BEDROCK_MANTLE_CHAT.host, {"region": settings.aws_region}
        )
        transport = RebasedTransport(transport, default, base_url)
    return RouterConfig(
        api_keys={"bedrock-mantle-chat": settings.aws_bearer_token_bedrock},
        settings={"bedrock-mantle-chat": {"region": settings.aws_region}},
        transport=transport,
    )


def _workers_ai(settings: Settings, transport: object) -> RouterConfig:
    account = settings.cloudflare_account_id
    default_url = f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1"
    base_url = checked_base_url(settings, _workers_ai_hosts(settings))
    return RouterConfig(
        api_keys={OPENAI_CHAT: settings.cloudflare_api_token},
        base_urls={OPENAI_CHAT: base_url or default_url},
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
        own_hosts=_bedrock_hosts,
    ),
    "workers-ai": Host(
        provider=OPENAI_CHAT,
        default_model="@cf/openai/gpt-oss-120b",
        required=("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"),
        config=_workers_ai,
        own_hosts=_workers_ai_hosts,
    ),
}


def host_of(settings: Settings) -> Host:
    host = HOSTS[settings.llm_host]
    host.base_url(settings)
    missing = host.missing(settings)
    if missing:
        raise RuntimeError(
            f"LLM_HOST={settings.llm_host} needs {' and '.join(missing)}."
        )
    return host

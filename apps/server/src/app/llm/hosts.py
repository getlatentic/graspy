"""Where gpt-oss-120b is served: Amazon Bedrock by default, or Cloudflare
Workers AI. Both answer OpenAI Chat Completions, so one engine drives either."""

from __future__ import annotations

import re
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
from .base_url import OwnBase, checked_base_url, exact_host
from .profiles import PROFILES
from .transport import RebasedTransport

HostName = Literal["bedrock", "workers-ai"]
OPENAI_CHAT = "openai-chat"


@dataclass(frozen=True)
class Host:
    provider: str
    default_model: str
    required: tuple[str, ...]
    config: Callable[[Settings, object], RouterConfig]
    # The hostnames (and paths) its API key may be sent to.
    own: Callable[[Settings], tuple[OwnBase, ...]]
    default_base_url: Callable[[Settings], str]

    def model(self, settings: Settings) -> str:
        model_id = (settings.llm_model_id or "").strip() or self.default_model
        routed = f"{self.provider}:"
        return model_id if model_id.startswith(routed) else routed + model_id

    def missing(self, settings: Settings) -> list[str]:
        return [key for key in self.required if not getattr(settings, key.lower())]

    def base_url(self, settings: Settings) -> str:
        return checked_base_url(settings, self.own(settings)) or self.default_base_url(
            settings
        )

    def endpoint(self, settings: Settings) -> str:
        """The hostname the requests go to."""
        return urlsplit(self.base_url(settings)).hostname


BEDROCK_HOSTNAME = re.compile(r"bedrock-mantle\.(?P<region>[a-z0-9-]+)\.api\.aws")
# lm15 needs a region to render its URL from; a localhost override has none.
NO_REGION = "local"


def _bedrock_own(settings: Settings) -> tuple[OwnBase, ...]:
    return (OwnBase("bedrock-mantle.<region>.api.aws", BEDROCK_HOSTNAME),)


def _bedrock_default_url(settings: Settings) -> str:
    return PROFILES["gpt-oss-120b"].base_url


def _region_of(url: str) -> str:
    found = BEDROCK_HOSTNAME.fullmatch(urlsplit(url).hostname or "")
    return found["region"] if found else NO_REGION


def _workers_ai_default_url(settings: Settings) -> str:
    return (
        f"https://api.cloudflare.com/client/v4/accounts/"
        f"{settings.cloudflare_account_id}/ai/v1"
    )


def _workers_ai_own(settings: Settings) -> tuple[OwnBase, ...]:
    """api.cloudflare.com and gateway.ai.cloudflare.com serve every account, so
    the path has to name this deployment's."""
    account = settings.cloudflare_account_id
    if not account:
        return ()
    return (
        exact_host("api.cloudflare.com", f"/client/v4/accounts/{account}/"),
        exact_host("gateway.ai.cloudflare.com", f"/v1/{account}/"),
    )


def _bedrock(settings: Settings, transport: object) -> RouterConfig:
    """lm15 renders its URL from a region; the request is then moved to the
    base URL, which is the same URL unless the deployment chose another path."""
    base_url = HOSTS["bedrock"].base_url(settings)
    region = _region_of(base_url)
    rendered = render_base_url(BEDROCK_MANTLE_CHAT.host, {"region": region})
    if base_url != rendered:
        transport = RebasedTransport(transport, rendered, base_url)
    return RouterConfig(
        api_keys={"bedrock-mantle-chat": settings.aws_bearer_token_bedrock},
        settings={"bedrock-mantle-chat": {"region": region}},
        transport=transport,
    )


def _workers_ai(settings: Settings, transport: object) -> RouterConfig:
    return RouterConfig(
        api_keys={OPENAI_CHAT: settings.cloudflare_api_token},
        base_urls={OPENAI_CHAT: HOSTS["workers-ai"].base_url(settings)},
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
        own=_bedrock_own,
        default_base_url=_bedrock_default_url,
    ),
    "workers-ai": Host(
        provider=OPENAI_CHAT,
        default_model="@cf/openai/gpt-oss-120b",
        required=("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"),
        config=_workers_ai,
        own=_workers_ai_own,
        default_base_url=_workers_ai_default_url,
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

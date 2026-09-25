from __future__ import annotations

import logging

import dspy
from dspy.clients.engines import AsyncLM15Engine
from dspy.lm15 import RouterConfig

from ..config.generation import LLM_MAX_TOKENS, LLM_REASONING_EFFORT, LLM_TEMPERATURE
from ..settings import Settings
from .transport import HttpxTransport

logger = logging.getLogger(__name__)

# Bedrock's Chat Completions on bedrock-mantle. The same wire on
# bedrock-runtime inlines gpt-oss's reasoning into the answer, which then
# fails to parse.
PROVIDER = "bedrock-mantle-chat"

# A Worker's filesystem is memory and an isolate gets 128 MB, so there is no
# disk cache and a small memory one.
MEMORY_CACHE_ENTRIES = 256


class AsyncOnlyEngine:
    """The synchronous engine DSPy requires beside an async one. A Worker
    cannot make a synchronous request, so it is refused everywhere, or it
    would pass locally and fail only in production."""

    def complete(self, request):
        raise RuntimeError(
            "Generation is async-only: call module.acall(...), not module(...). "
            "Cloudflare Workers cannot make a synchronous network request."
        )


def resolve_model(settings: Settings, model_id: str | None = None) -> str:
    if not settings.aws_bearer_token_bedrock:
        raise RuntimeError(
            "AWS_BEARER_TOKEN_BEDROCK is required: Amazon Bedrock is the only provider."
        )
    model_id = model_id or settings.llm_model_id
    return model_id if model_id.startswith(f"{PROVIDER}:") else f"{PROVIDER}:{model_id}"


def build_lm(
    settings: Settings,
    transport: HttpxTransport | None = None,
    model_id: str | None = None,
) -> dspy.LM:
    model = resolve_model(settings, model_id)
    config = RouterConfig(
        api_keys={PROVIDER: settings.aws_bearer_token_bedrock},
        settings={PROVIDER: {"region": settings.aws_region}},
        transport=transport or HttpxTransport(),
    )
    return dspy.LM(
        model,
        engine=AsyncOnlyEngine(),
        async_engine=AsyncLM15Engine(config),
        max_tokens=LLM_MAX_TOKENS,
        temperature=LLM_TEMPERATURE,
        reasoning_effort=LLM_REASONING_EFFORT,
    )


def configure_cache() -> None:
    dspy.configure_cache(
        enable_disk_cache=False,
        enable_memory_cache=True,
        memory_max_entries=MEMORY_CACHE_ENTRIES,
    )


def configure_dspy(settings: Settings) -> None:
    """For a script; the app sets its model per request."""
    lm = build_lm(settings)
    logger.info("Configuring DSPy with model: %s", lm.model)
    dspy.configure(lm=lm)
    configure_cache()

from __future__ import annotations

import logging

import dspy
from dspy.clients.engines import AsyncLM15Engine

from ..config.generation import LLM_MAX_TOKENS, LLM_REASONING_EFFORT, LLM_TEMPERATURE
from ..settings import Settings
from .hosts import host_of
from .transport import HttpxTransport

logger = logging.getLogger(__name__)

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


def resolve_model(settings: Settings) -> str:
    return host_of(settings).model(settings)


def build_lm(settings: Settings, transport: HttpxTransport | None = None) -> dspy.LM:
    host = host_of(settings)
    return dspy.LM(
        host.model(settings),
        engine=AsyncOnlyEngine(),
        async_engine=AsyncLM15Engine(
            host.config(settings, transport or HttpxTransport())
        ),
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

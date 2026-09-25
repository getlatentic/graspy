from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from .caller import Caller


@dataclass(frozen=True)
class AppTool:
    """A tool a view calls when the learner taps, never the model: app-only,
    in MCP Apps' terms."""

    name: str
    description: str
    arguments: type[BaseModel]
    run: Callable[[Any, Caller], Awaitable[dict]]
    # For a tool a host calls to open a view of its own.
    resource_uri: str | None = None
    # What the tutor reads of the call, for a tool a card in a conversation
    # calls.
    told: Callable[[Any], str] | None = None

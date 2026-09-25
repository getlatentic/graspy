"""The app-only tools a card's view calls when the learner taps. The MCP
server answers the call; the app sends the request again with the learner's
next message, and it is read here for what the tutor is told. A request that
is not a known tool with valid arguments is dropped, never failing the
turn."""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ValidationError

from ..app_tool import AppTool
from ..learner.answers import PracticeAnswer, answered

logger = logging.getLogger(__name__)

PART_KEY = "appCalls"
TOOLS_CALL = "tools/call"
# A tap sends one or two.
MAX_CALLS = 5


APP_TOOLS: dict[str, AppTool] = {
    tool.name: tool
    for tool in (
        AppTool(
            "answer_practice",
            "Mark the option the learner chose on a practice question, and "
            "keep it on their record.",
            PracticeAnswer,
            lambda answer, caller: answered(answer, caller, "practice"),
            told=lambda answer: answer.describe(),
        ),
    )
}


@dataclass(frozen=True)
class AppCall:
    name: str
    arguments: BaseModel
    told: str


def _call(request: Any) -> AppCall | None:
    if not isinstance(request, Mapping) or request.get("method") != TOOLS_CALL:
        return None
    params = request.get("params")
    if not isinstance(params, Mapping):
        return None
    tool = APP_TOOLS.get(params.get("name"))
    if tool is None or tool.told is None:
        return None
    try:
        arguments = tool.arguments.model_validate(params.get("arguments"))
    except ValidationError:
        logger.warning("Dropped a malformed call to %s", tool.name, exc_info=True)
        return None
    return AppCall(tool.name, arguments, tool.told(arguments))


def app_calls(parts: Iterable[Mapping[str, Any]]) -> list[AppCall]:
    for part in parts:
        data = part.get("data")
        if isinstance(data, Mapping) and isinstance(data.get(PART_KEY), list):
            calls = (_call(request) for request in data[PART_KEY][:MAX_CALLS])
            return [call for call in calls if call is not None]
    return []


def describe_calls(calls: list[AppCall]) -> str:
    return "\n\n".join(
        f"The learner called {call.name}:\n{call.told}" for call in calls
    )

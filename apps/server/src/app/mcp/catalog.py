"""What graspy offers an MCP host, in MCP Apps' terms: the tutor's tools that
show UI, read from its own registry, the app-only tools views call, and the
ui:// resources that render them."""

from __future__ import annotations

import inspect
import json
import re
import typing
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import cache
from typing import Any

from pydantic import BaseModel, ValidationError, create_model

from ..agent.app_tools import APP_TOOLS
from ..agent.cards import PASSAGE_UI, PRACTICE_UI
from ..agent.context import LearnerContext
from ..agent.reply import Outcome
from ..agent.toolkit import TOOLS, Turn
from ..app_tool import AppTool
from ..caller import Caller
from ..learner.route import LEARNER_TOOLS
from ..lessons.tools import LESSON_TOOLS, LESSON_UI
from .views import Views

RESOURCE_MIME_TYPE = "text/html;profile=mcp-app"
MODEL_AND_APP = ("model", "app")
APP_ONLY = ("app",)

# The host frames the views without a border; each card draws its own.
UI_META = {"prefersBorder": False}
_HEAD = re.compile(r"<head[^>]*>", re.IGNORECASE)


@dataclass(frozen=True)
class McpTool:
    name: str
    description: str
    arguments: type[BaseModel]
    visibility: tuple[str, ...]
    run: Callable[[Any, Caller], Awaitable[dict]]
    resource_uri: str | None = None

    def listed(self) -> dict:
        ui: dict[str, Any] = {"visibility": list(self.visibility)}
        if self.resource_uri:
            ui["resourceUri"] = self.resource_uri
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": self.arguments.model_json_schema(by_alias=True),
            "_meta": {"ui": ui},
        }

    async def call(self, arguments: Any, caller: Caller) -> dict:
        """Arguments it cannot read are a tool error, which the caller can
        correct, not a protocol error."""
        try:
            parsed = self.arguments.model_validate(arguments or {})
        except ValidationError as error:
            return failed(
                f"Invalid arguments for {self.name}: "
                + "; ".join(
                    f"{'.'.join(map(str, e['loc']))}: {e['msg']}"
                    for e in error.errors()
                )
            )
        return await self.run(parsed, caller)


@dataclass(frozen=True)
class UiResource:
    uri: str
    name: str
    title: str
    description: str
    view: str

    def listed(self) -> dict:
        return {
            "uri": self.uri,
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "mimeType": RESOURCE_MIME_TYPE,
            "_meta": {"ui": UI_META},
        }

    async def read(self, views: Views, origin: str) -> dict:
        """The view loads its files from ``origin``, this server's: a host
        frames the document on an origin of its own."""
        document = await views.read(self.view)
        base = f'<base href="{origin}/">'
        head = _HEAD.search(document)
        at = head.end() if head else 0
        return {
            "contents": [
                {
                    "uri": self.uri,
                    "mimeType": RESOURCE_MIME_TYPE,
                    "text": document[:at] + base + document[at:],
                    "_meta": {
                        "ui": {
                            **UI_META,
                            "csp": {
                                "resourceDomains": [origin],
                                "baseUriDomains": [origin],
                            },
                        }
                    },
                }
            ]
        }


def failed(text: str) -> dict:
    return {"content": [{"type": "text", "text": text}], "isError": True}


def _arguments_of(tool: Callable) -> type[BaseModel]:
    hints = typing.get_type_hints(tool)
    fields: dict[str, Any] = {
        name: (
            hints[name],
            ... if parameter.default is parameter.empty else parameter.default,
        )
        for name, parameter in inspect.signature(tool).parameters.items()
    }
    return create_model(f"{tool.__name__}_arguments", **fields)


def _result_of(returned: dict | Outcome) -> dict:
    if isinstance(returned, Outcome) and returned.card is not None:
        return returned.card.tool_result.model_dump(by_alias=True, mode="json")
    told = returned.told if isinstance(returned, Outcome) else returned
    text = json.dumps(told, ensure_ascii=False)
    return (
        failed(text)
        if "error" in told
        else {"content": [{"type": "text", "text": text}]}
    )


def _model_tool(name: str, tool: Callable, resource_uri: str) -> McpTool:
    async def run(parsed: BaseModel, _caller: Caller) -> dict:
        # dict(), not model_dump(): nested models reach the tool as models.
        returned = tool(**dict(parsed))
        return _result_of(await returned if inspect.isawaitable(returned) else returned)

    return McpTool(
        name=name,
        description=inspect.getdoc(tool) or name,
        arguments=_arguments_of(tool),
        resource_uri=resource_uri,
        visibility=MODEL_AND_APP,
        run=run,
    )


def _app_tool(tool: AppTool) -> McpTool:
    return McpTool(
        name=tool.name,
        description=tool.description,
        arguments=tool.arguments,
        visibility=APP_ONLY,
        run=tool.run,
        resource_uri=tool.resource_uri,
    )


@cache
def tools() -> dict[str, McpTool]:
    # Built on first use: Worker startup must not build tools.
    offered = [
        _model_tool(spec.name, spec.build(Turn(LearnerContext(), "")), spec.ui)
        for spec in TOOLS
        if spec.ui is not None
    ]
    offered += [
        _app_tool(tool) for tool in (*APP_TOOLS.values(), *LESSON_TOOLS, *LEARNER_TOOLS)
    ]
    return {tool.name: tool for tool in offered}


RESOURCES: dict[str, UiResource] = {
    resource.uri: resource
    for resource in (
        UiResource(
            uri=PRACTICE_UI,
            name="practice",
            title="Practice",
            description="A practice question the learner answers with a tap, marked at once.",
            view="practice.html",
        ),
        UiResource(
            uri=PASSAGE_UI,
            name="passage",
            title="Reading",
            description="A passage to read, with questions on it the learner answers with a tap.",
            view="passage.html",
        ),
        UiResource(
            uri=LESSON_UI,
            name="lesson",
            title="Lesson",
            description="A topic's lesson, slide by slide, with a check on each "
            "slide; it shows the slides as they are made.",
            view="lesson.html",
        ),
    )
}

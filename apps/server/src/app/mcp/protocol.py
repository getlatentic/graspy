"""MCP's JSON-RPC methods, each request answered from itself, so any Worker
instance serves any request: the initialize-handshake era (2025-03-26 to
2025-11-25) without a session id. The stateless era's server/discover probe
is told the versions spoken here (routes.py)."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any

from ..caller import Caller, Keeping
from .catalog import RESOURCE_MIME_TYPE, RESOURCES, tools
from .views import Views, ViewsMissing

PROTOCOL_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26")
SERVER_INFO = {"name": "graspy", "title": "graspy", "version": "1.0.0"}
UI_EXTENSION = "io.modelcontextprotocol/ui"
INSTRUCTIONS = (
    "graspy's tutor tools. give_practice sets the learner multiple-choice "
    "questions as a card they answer with a tap; give_passage sets a passage "
    "to read with questions on it."
)

INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603
RESOURCE_NOT_FOUND = -32002
UNSUPPORTED_PROTOCOL_VERSION = -32022


@dataclass(frozen=True)
class Server:
    views: Views
    origin: str
    keeping: Keeping


class McpError(Exception):
    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


async def _initialize(
    params: Mapping[str, Any], _server: Server, _learner: str | None
) -> dict:
    asked = params.get("protocolVersion")
    return {
        "protocolVersion": asked
        if asked in PROTOCOL_VERSIONS
        else PROTOCOL_VERSIONS[0],
        "capabilities": {
            "tools": {},
            "resources": {},
            "extensions": {UI_EXTENSION: {"mimeTypes": [RESOURCE_MIME_TYPE]}},
        },
        "serverInfo": SERVER_INFO,
        "instructions": INSTRUCTIONS,
    }


async def _ping(
    _params: Mapping[str, Any], _server: Server, _learner: str | None
) -> dict:
    return {}


async def _list_tools(
    _params: Mapping[str, Any], _server: Server, _learner: str | None
) -> dict:
    return {"tools": [tool.listed() for tool in tools().values()]}


async def _call_tool(
    params: Mapping[str, Any], server: Server, learner: str | None
) -> dict:
    tool = tools().get(params.get("name"))
    if tool is None:
        raise McpError(INVALID_PARAMS, f"Unknown tool: {params.get('name')}")
    return await tool.call(params.get("arguments"), Caller(learner, server.keeping))


async def _list_resources(
    _params: Mapping[str, Any], _server: Server, _learner: str | None
) -> dict:
    return {"resources": [resource.listed() for resource in RESOURCES.values()]}


async def _list_templates(
    _params: Mapping[str, Any], _server: Server, _learner: str | None
) -> dict:
    return {"resourceTemplates": []}


async def _read_resource(
    params: Mapping[str, Any], server: Server, _learner: str | None
) -> dict:
    resource = RESOURCES.get(params.get("uri"))
    if resource is None:
        raise McpError(RESOURCE_NOT_FOUND, f"Resource not found: {params.get('uri')}")
    try:
        return await resource.read(server.views, server.origin)
    except ViewsMissing as error:
        raise McpError(INTERNAL_ERROR, str(error)) from error


Handler = Callable[[Mapping[str, Any], Server, str | None], Awaitable[dict]]

METHODS: dict[str, Handler] = {
    "initialize": _initialize,
    "ping": _ping,
    "tools/list": _list_tools,
    "tools/call": _call_tool,
    "resources/list": _list_resources,
    "resources/templates/list": _list_templates,
    "resources/read": _read_resource,
}


def _error(message_id: Any, code: int, text: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": message_id,
        "error": {"code": code, "message": text},
    }


async def answer(
    message: Any, server: Server, learner: str | None = None
) -> dict | None:
    """None for a notification or a response, which get no answer."""
    if not isinstance(message, Mapping) or message.get("jsonrpc") != "2.0":
        return _error(None, INVALID_REQUEST, "Not a JSON-RPC 2.0 message")
    if "id" not in message or "method" not in message:
        return None
    message_id, method = message["id"], message["method"]
    handler = METHODS.get(method) if isinstance(method, str) else None
    if handler is None:
        return _error(message_id, METHOD_NOT_FOUND, f"Method not found: {method}")
    params = message.get("params") or {}
    if not isinstance(params, Mapping):
        return _error(message_id, INVALID_PARAMS, "params must be an object")
    try:
        return {
            "jsonrpc": "2.0",
            "id": message_id,
            "result": await handler(params, server, learner),
        }
    except McpError as error:
        return _error(message_id, error.code, error.message)

"""The MCP endpoint over Streamable HTTP, answering each POST with JSON, and
the sandbox that frames views."""

from __future__ import annotations

import json

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from .protocol import (
    INVALID_REQUEST,
    PROTOCOL_VERSIONS,
    UNSUPPORTED_PROTOCOL_VERSION,
    answer,
)
from .sandbox_routes import sandbox_routes

MCP_PATH = "/mcp"
PARSE_ERROR = -32700
# A tool's arguments are a question and its options: kilobytes, not more.
MAX_BODY = 64 * 1024


def _refused(
    status: int, code: int, text: str, message_id=None, data=None
) -> JSONResponse:
    error = {"code": code, "message": text, **({"data": data} if data else {})}
    return JSONResponse(
        {"jsonrpc": "2.0", "id": message_id, "error": error}, status_code=status
    )


def _unsupported(message: object, version: str) -> JSONResponse:
    """Names the versions spoken here, so the client can fall back to one."""
    message_id = message.get("id") if isinstance(message, dict) else None
    return _refused(
        400,
        UNSUPPORTED_PROTOCOL_VERSION,
        f"Unsupported protocol version: {version}",
        message_id,
        {"supported": list(PROTOCOL_VERSIONS), "requested": version},
    )


async def mcp(request: Request) -> Response:
    if request.method != "POST":
        return Response(status_code=405, headers={"Allow": "POST"})
    body = await request.body()
    if len(body) > MAX_BODY:
        return _refused(413, INVALID_REQUEST, "Request too large")
    try:
        message = json.loads(body)
    except ValueError:
        return _refused(400, PARSE_ERROR, "Parse error")
    version = request.headers.get("mcp-protocol-version")
    if version and version not in PROTOCOL_VERSIONS:
        return _unsupported(message, version)
    if isinstance(message, list):
        return _refused(400, INVALID_REQUEST, "Batches are not part of MCP")
    session = request.scope.get("auth")
    response = await answer(
        message, request.app.state.mcp, session.learner if session else None
    )
    if response is None:
        return Response(status_code=202)
    return JSONResponse(response)


def mcp_routes() -> list[Route]:
    return [
        Route(MCP_PATH, mcp, methods=["GET", "POST", "DELETE"]),
        *sandbox_routes(),
    ]

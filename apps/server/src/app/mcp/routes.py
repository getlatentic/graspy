"""The MCP endpoint over Streamable HTTP, answering each POST with JSON, and
the sandbox that frames views."""

from __future__ import annotations

import json

from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response
from starlette.routing import Route

from .protocol import (
    INVALID_REQUEST,
    PROTOCOL_VERSIONS,
    UNSUPPORTED_PROTOCOL_VERSION,
    answer,
)
from .sandbox import (
    FRAME_PAGE,
    FRAME_PATH,
    WORKER_FILE,
    WORKER_PATH,
    WORKER_POLICY,
    declared_csp,
    page,
    proxy_policy,
    view_policy,
)
from .views import ViewsMissing

MCP_PATH = "/mcp"
PARSE_ERROR = -32700
# A tool's arguments are a question and its options: kilobytes, not more.
MAX_BODY = 64 * 1024
NOT_A_HOST = "This page frames views for graspy only."


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


def _framing_host(request: Request) -> str | None:
    """The host named in ?host=, if it may frame views: never one on this
    origin, so the view is always isolated from it."""
    host = request.query_params.get("host", "")
    own = request.app.state.mcp.origin
    if host == own or not request.app.state.origin_allowed(host):
        return None
    return host


async def ui_sandbox(request: Request) -> Response:
    """The proxy a web host frames each view in, on this origin so it is
    never the host's."""
    host = _framing_host(request)
    if host is None:
        return PlainTextResponse(NOT_A_HOST, 400)
    own = f"{request.url.scheme}://{request.url.netloc}"
    return HTMLResponse(
        page(), headers={"content-security-policy": proxy_policy(host, own)}
    )


async def ui_sandbox_frame(request: Request) -> Response:
    """The page the proxy writes the view into, with the policy graspy's
    views declare, whatever the request asks for."""
    host = _framing_host(request)
    if host is None:
        return PlainTextResponse(NOT_A_HOST, 400)
    csp = declared_csp(request.app.state.mcp.origin)
    return HTMLResponse(
        FRAME_PAGE, headers={"content-security-policy": view_policy(csp, host)}
    )


async def ui_sandbox_worker(request: Request) -> Response:
    """Served at the root so it may control the sandbox page; a stale worker
    would serve stale views."""
    try:
        source = await request.app.state.mcp.views.read(WORKER_FILE)
    except ViewsMissing as error:
        return PlainTextResponse(str(error), 404)
    return Response(
        source,
        media_type="text/javascript",
        headers={
            "cache-control": "no-cache",
            "content-security-policy": WORKER_POLICY,
        },
    )


def mcp_routes() -> list[Route]:
    return [
        Route(MCP_PATH, mcp, methods=["GET", "POST", "DELETE"]),
        Route("/ui-sandbox", ui_sandbox, methods=["GET"]),
        Route(FRAME_PATH, ui_sandbox_frame, methods=["GET"]),
        Route(WORKER_PATH, ui_sandbox_worker, methods=["GET"]),
    ]

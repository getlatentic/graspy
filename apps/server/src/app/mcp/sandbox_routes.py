"""The sandbox a host frames each view in, one per build of the views:
/ui-sandbox/<build>/ is the proxy, frame is the page the view is written
into, and sw.js the worker that serves both and the build's files offline."""

from __future__ import annotations

from urllib.parse import urlencode

from starlette.requests import Request
from starlette.responses import (
    HTMLResponse,
    PlainTextResponse,
    RedirectResponse,
    Response,
)
from starlette.routing import Route

from .sandbox import (
    FRAME_NAME,
    FRAME_PAGE,
    SANDBOX_ROOT,
    WORKER_FILE,
    WORKER_NAME,
    WORKER_POLICY,
    build_of,
    declared_csp,
    is_build,
    page,
    proxy_policy,
    sandbox_path,
    served_worker,
    view_policy,
)
from .views import ViewsMissing

NOT_A_HOST = "This page frames views for graspy only."


def _framing_host(request: Request) -> str | None:
    """The host named in ?host=, if it may frame views: never one on this
    origin, so the view is always isolated from it."""
    host = request.query_params.get("host", "")
    own = request.app.state.mcp.origin
    if host == own or not request.app.state.origin_allowed(host):
        return None
    return host


def _checked(request: Request) -> str | Response:
    """The framing host of a sandbox page, or why the page is refused."""
    if not is_build(request.path_params["build"]):
        return PlainTextResponse("No such sandbox.", 404)
    host = _framing_host(request)
    return PlainTextResponse(NOT_A_HOST, 400) if host is None else host


async def ui_sandbox(request: Request) -> Response:
    """The proxy a web host frames each view in, on this origin so it is
    never the host's. Served for any build: the page is the same, and only
    the current build's worker is."""
    host = _checked(request)
    if isinstance(host, Response):
        return host
    own = request.app.state.mcp.origin
    policy = proxy_policy(host, own, request.path_params["build"])
    return HTMLResponse(page(), headers={"content-security-policy": policy})


async def ui_sandbox_frame(request: Request) -> Response:
    """The page the proxy writes the view into, with the policy graspy's
    views declare, whatever the request asks for."""
    host = _checked(request)
    if isinstance(host, Response):
        return host
    policy = view_policy(declared_csp(request.app.state.mcp.origin), host)
    return HTMLResponse(FRAME_PAGE, headers={"content-security-policy": policy})


async def ui_sandbox_worker(request: Request) -> Response:
    """The current build's worker only. An earlier build's stays registered
    with the script it was installed from: a browser keeps a worker whose
    update is not found."""
    try:
        worker = await request.app.state.mcp.views.read(WORKER_FILE)
    except ViewsMissing as error:
        return PlainTextResponse(str(error), 404)
    if request.path_params["build"] != build_of(worker):
        return PlainTextResponse("That build's worker is gone.", 404)
    state = request.app.state
    return Response(
        served_worker(worker, state.mcp.origin, state.framing_hosts),
        media_type="text/javascript",
        headers={
            "cache-control": "no-cache",
            "content-security-policy": WORKER_POLICY,
        },
    )


async def current_sandbox(request: Request) -> Response:
    """A host that names no build is sent to the current build's sandbox."""
    try:
        worker = await request.app.state.mcp.views.read(WORKER_FILE)
    except ViewsMissing as error:
        return PlainTextResponse(str(error), 404)
    query = urlencode({"host": request.query_params.get("host", "")})
    return RedirectResponse(f"{sandbox_path(build_of(worker))}?{query}", 307)


def sandbox_routes() -> list[Route]:
    build = f"{SANDBOX_ROOT}/{{build}}/"
    return [
        Route(SANDBOX_ROOT, current_sandbox, methods=["GET"]),
        Route(build, ui_sandbox, methods=["GET"]),
        Route(f"{build}{FRAME_NAME}", ui_sandbox_frame, methods=["GET"]),
        Route(f"{build}{WORKER_NAME}", ui_sandbox_worker, methods=["GET"]),
    ]

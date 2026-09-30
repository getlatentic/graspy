"""The A2A routes, built when the first request for one arrives.

The A2A SDK and its protobuf types take a few seconds to import on a Worker, and a fresh Worker instance
used to import them while building the app for whatever the first request was, a sign-in or a class list
included. They are not in the startup snapshot either, which has a size cap. So the app carries only this
matcher, and the SDK is imported by the first request to the agent card or to the A2A endpoint.
"""

from collections.abc import Callable

from starlette.routing import BaseRoute, Match, NoMatchFound, Router
from starlette.types import Receive, Scope, Send

WELL_KNOWN_CARD = "/.well-known/agent-card.json"


class LazyA2ARoutes(BaseRoute):
    """Matches the paths the A2A routes answer, and hands them to routes built on first use."""

    def __init__(self, prefix: str, build: Callable[[], list]) -> None:
        self._prefix = prefix.rstrip("/")
        self._build = build
        self._router: Router | None = None

    def matches(self, scope: Scope) -> tuple[Match, Scope]:
        if scope["type"] not in ("http", "websocket"):
            return Match.NONE, {}
        path = scope["path"]
        ours = (
            path == WELL_KNOWN_CARD
            or path == self._prefix
            or path.startswith(self._prefix + "/")
        )
        return (Match.FULL, {}) if ours else (Match.NONE, {})

    async def handle(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self._router is None:
            self._router = Router(routes=self._build())
        await self._router(scope, receive, send)

    def url_path_for(self, name: str, /, **path_params: object) -> object:
        raise NoMatchFound(name, path_params)

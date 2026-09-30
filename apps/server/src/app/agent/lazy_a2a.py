"""The A2A routes, built when the first request for one arrives.

The A2A SDK and its protobuf types take a few seconds to import on a Worker, and the startup snapshot has a size
cap, so neither startup nor a request for anything else should pay for them. The app carries only this matcher;
the first request to the agent card or to the A2A endpoint imports the SDK and builds the routes.
"""

from collections.abc import Callable

from starlette.routing import BaseRoute, Match, NoMatchFound, Router
from starlette.types import Receive, Scope, Send

WELL_KNOWN_CARD = "/.well-known/agent-card.json"


class LazyA2ARoutes(BaseRoute):
    """Matches the paths the A2A routes answer, and hands them to routes built on first use."""

    def __init__(self, prefix: str, build: Callable[[], list]) -> None:
        if not prefix.startswith("/") or prefix.rstrip("/") == "":
            raise ValueError(
                f"The A2A path prefix must start with '/' and name a path, not {prefix!r}"
            )
        self._prefix = prefix.rstrip("/")
        self._build = build
        self._router: Router | None = None

    def matches(self, scope: Scope) -> tuple[Match, Scope]:
        if scope["type"] not in ("http", "websocket"):
            return Match.NONE, {}
        root = scope.get("root_path", "")
        path = scope["path"].removeprefix(root) if root else scope["path"]
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

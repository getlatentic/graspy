"""Per-client request budgets. Generation spends model credits, so its budget
is tighter than the API's, and session issuance, which every generation
needs first, tightest. Budgets count per Cloudflare location: the provider
account's spend cap is the only absolute ceiling."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Protocol

RETRY_AFTER_SECONDS = 60

_REJECTION = json.dumps({"error": "Too many requests", "code": "rate_limited"}).encode()


class Limiter(Protocol):
    async def allow(self, key: str) -> bool: ...


@dataclass(frozen=True)
class Budgets:
    session: Limiter
    generate: Limiter
    agent: Limiter
    api: Limiter


class RateLimitMiddleware:
    """Raw ASGI, so a streamed response passes through unbuffered."""

    def __init__(
        self, app, *, budgets: Budgets, agent_prefix: str, mcp_path: str
    ) -> None:
        self.app = app
        self._budgets = budgets
        self._agent_prefix = "/" + agent_prefix.strip("/")
        self._mcp_path = mcp_path

    async def __call__(self, scope, receive, send) -> None:
        budget = self._budget_for(scope)
        if budget is None or await budget.allow(client_key(scope)):
            await self.app(scope, receive, send)
            return
        await send(
            {
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(_REJECTION)).encode()),
                    (b"retry-after", str(RETRY_AFTER_SECONDS).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": _REJECTION})

    def _budget_for(self, scope) -> Limiter | None:
        # A preflight costs nothing; limiting it breaks CORS.
        if scope["type"] != "http" or scope["method"] == "OPTIONS":
            return None
        path = scope["path"]
        if path == "/api/session":
            return self._budgets.session
        if path.startswith(("/api/curriculum/", "/api/subjects/")):
            return self._budgets.generate
        if path == self._agent_prefix or path.startswith(f"{self._agent_prefix}/"):
            return self._budgets.agent
        if path.startswith("/api") or path == self._mcp_path:
            return self._budgets.api
        return None


def client_key(scope) -> str:
    """The client's address as Cloudflare saw it at the edge."""
    for name, value in scope.get("headers", []):
        if name == b"cf-connecting-ip":
            return value.decode("latin-1")
    client = scope.get("client")
    return client[0] if client else "unknown"

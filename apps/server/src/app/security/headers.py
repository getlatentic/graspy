"""Security headers on every response, 401 and 429 included: a Worker has no
nginx in front of it."""

from __future__ import annotations

_HEADERS = (
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"strict-transport-security", b"max-age=31536000; includeSubDomains"),
)
_NAMES = frozenset(name for name, _ in _HEADERS)

# The API returns JSON and is never framed.
_CSP = (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'")

# The docs load from a CDN, outside production only; the sandbox that frames
# MCP Apps views sets its own on each of its pages and its worker.
OWN_POLICY_PATHS = ("/api/docs", "/api/redoc", "/ui-sandbox")


class SecurityHeadersMiddleware:
    """Raw ASGI, so a streamed response passes through unbuffered."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        extra = (
            _HEADERS
            if scope["path"].startswith(OWN_POLICY_PATHS)
            else (*_HEADERS, _CSP)
        )
        replaced = _NAMES | {name for name, _ in extra}

        async def send_with_headers(message) -> None:
            if message["type"] == "http.response.start":
                headers = [
                    (k, v)
                    for k, v in message.get("headers", [])
                    if k.lower() not in replaced
                ]
                message = {**message, "headers": [*headers, *extra]}
            await send(message)

        await self.app(scope, receive, send_with_headers)

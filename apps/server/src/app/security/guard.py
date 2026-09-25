"""The session guard, in two shapes answering with one 401 body: a
dependency for the FastAPI routes, and middleware in front of the A2A and MCP
endpoints, which are Starlette routes."""

from __future__ import annotations

import json
from dataclasses import dataclass

from fastapi import HTTPException, Request

from .session import InvalidSessionToken, account_of, learner_of, verify

BEARER_PREFIX = "Bearer "

# The client mints a new token on any 401; the code tells a person whether a
# token was sent at all.
MISSING_CODE = "session_required"
INVALID_CODE = "session_invalid"


@dataclass(frozen=True)
class Session:
    learner: str | None
    # The signed-in account's uid; its learners are managed only with it.
    account: str | None = None


def checked(authorization: str | None, secret: str) -> Session | dict:
    """The session an Authorization header carries, or why it is refused."""
    if not authorization or not authorization.startswith(BEARER_PREFIX):
        return {"error": "A session token is required", "code": MISSING_CODE}
    try:
        claims = verify(authorization[len(BEARER_PREFIX) :], secret)
    except InvalidSessionToken as exc:
        return {"error": str(exc), "code": INVALID_CODE}
    return Session(learner=learner_of(claims), account=account_of(claims))


async def require_session(request: Request) -> Session:
    session = checked(
        request.headers.get("authorization"), request.app.state.session_secret
    )
    if not isinstance(session, Session):
        raise HTTPException(status_code=401, detail=session)
    return session


class SessionMiddleware:
    """Raw ASGI: BaseHTTPMiddleware buffers the response body, which would
    hold every streamed agent reply until the turn finished."""

    def __init__(self, app, *, prefixes: tuple[str, ...], secret: str) -> None:
        self.app = app
        self.prefixes = tuple("/" + prefix.strip("/") for prefix in prefixes)
        self.secret = secret

    def _needs_token(self, scope) -> bool:
        if scope["type"] != "http":
            return False
        # A preflight never carries Authorization; refusing it breaks CORS.
        if scope["method"] == "OPTIONS":
            return False
        path = scope["path"]
        return any(
            path == prefix or path.startswith(f"{prefix}/") for prefix in self.prefixes
        )

    async def __call__(self, scope, receive, send) -> None:
        if not self._needs_token(scope):
            await self.app(scope, receive, send)
            return
        refused = checked(_authorization(scope), self.secret)
        if isinstance(refused, Session):
            # request.auth, which the A2A SDK copies into each call's context.
            scope["auth"] = refused
            await self.app(scope, receive, send)
            return

        # The shape FastAPI gives the refusal on the REST routes.
        body = json.dumps({"detail": refused}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 401,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


def _authorization(scope) -> str | None:
    for name, value in scope["headers"]:
        if name == b"authorization":
            return value.decode("latin-1")
    return None

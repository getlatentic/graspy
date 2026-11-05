"""The WebSocket to a chat's Durable Object, where worker.py meets JavaScript.

A learner's page opens `wss://<api>/api/chats/<chat>/turns/<turn>/socket?after=<seq>`. The Worker
checks who is asking, then hands the upgrade to the chat's object, which accepts it hibernatably:
the object is evicted while the socket is idle, and woken to send what the turn keeps and to read
what the page sends. A browser cannot set an Authorization header on a WebSocket, so the session
token is the second of the subprotocols the page offers; the first, `graspy.v1`, is the one chosen."""

from __future__ import annotations

import json
import re
from typing import Any

from .chatlog import kinds
from .chatlog.log import ChatLog
from .security.guard import Session, checked
from .turns.access import may_follow
from .turns.sockets import ChatSockets, Socket

PROTOCOL = "graspy.v1"
# Sockets a chat's object holds at once: a page needs one, and a few more cover reconnects.
MAX_SOCKETS = 8
_SEQ = re.compile(r"[0-9]{1,12}")
_PATH = re.compile(
    r"^/api/chats/(?P<chat>[A-Za-z0-9_-]{8,64})/turns/(?P<turn>[A-Za-z0-9_-]{8,64})/socket$"
)


class JsSocket:
    """An accepted WebSocket of a Durable Object, as `ChatSockets` needs it."""

    def __init__(self, ws: Any, js_object: Any) -> None:
        self._ws = ws
        self._js_object = js_object

    @property
    def attachment(self) -> dict[str, Any]:
        return self._ws.deserializeAttachment().to_py()

    def attach(self, value: dict[str, Any]) -> None:
        self._ws.serializeAttachment(self._js_object(value))

    def send(self, text: str) -> None:
        self._ws.send(text)

    def close(self, code: int, reason: str) -> None:
        self._ws.close(code, reason)


def socket_target(url: str) -> tuple[str, str, int] | None:
    """The chat, turn and cursor a socket URL names, or None if it is not a turn's socket."""
    from urllib.parse import parse_qs, urlsplit

    parts = urlsplit(url)
    found = _PATH.match(parts.path)
    if not found:
        return None
    after = parse_qs(parts.query).get("after", ["0"])[0]
    return found["chat"], found["turn"], int(after) if _SEQ.fullmatch(after) else -1


def session_of(protocols: str | None, secret: str) -> Session | None:
    """The session the second subprotocol offered carries, if the first is ours."""
    offered = [item.strip() for item in (protocols or "").split(",")]
    if len(offered) != 2 or offered[0] != PROTOCOL:
        return None
    session = checked(f"Bearer {offered[1]}", secret)
    return session if isinstance(session, Session) else None


def refusal(status: int, code: str) -> Any:
    from js import Response

    return Response.new(
        json.dumps({"detail": {"code": code}}),
        status=status,
        headers={"Content-Type": "application/json"},
    )


async def connect(
    env: Any, app: Any, request: Any, target: tuple[str, str, int]
) -> Any:
    """Hands the upgrade to the chat's object, if the page may follow the chat."""
    chat, turn, after = target
    origin = request.headers.get("Origin")
    if after < 0 or (origin and not app.state.origin_allowed(origin)):
        return refusal(403, "socket_refused")
    session = session_of(
        request.headers.get("Sec-WebSocket-Protocol"), app.state.session_secret
    )
    if session is None:
        return refusal(401, "session_invalid")
    log = ChatLog(env.DB)
    if not await may_follow(log, chat, session.learner):
        return refusal(404, "chat_not_found")
    if await log.once_seq(chat, kinds.TURN_STARTED, turn) is None:
        return refusal(404, "turn_not_found")
    return await env.CHAT_TURNS.getByName(chat).fetch(request)


async def accept(ctx: Any, sockets: ChatSockets, url: str, js_object: Any) -> Any:
    """In the chat's object: accepts the socket the Worker forwarded, hibernatably, and sends it what
    it missed."""
    from js import Response, WebSocketPair

    target = socket_target(url)
    if target is None:
        return Response.new(None, status=404)
    if len(ctx.getWebSockets()) >= MAX_SOCKETS:
        return Response.new(None, status=429)
    chat, turn, after = target
    client, server = WebSocketPair.new().object_values()
    ctx.acceptWebSocket(server)
    socket: Socket = JsSocket(server, js_object)
    socket.attach({"chat": chat, "turn": turn, "cursor": after})
    await sockets.welcome(socket)
    return Response.new(
        None,
        js_object(
            {
                "status": 101,
                "webSocket": client,
                "headers": {"Sec-WebSocket-Protocol": PROTOCOL},
            }
        ),
    )

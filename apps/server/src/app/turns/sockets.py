"""The sockets a chat's Durable Object holds: each reads one turn, and is sent the frames it has not
had whenever the object keeps an event.

What a socket has had is its cursor, kept in the socket's attachment, which survives the object's
hibernation. A socket is always sent what the log holds after its cursor, so the frames it gets are
the frames a reconnecting client would be sent: one reading of the log serves both."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Protocol

from ..chatlog.log import ChatLog
from .frames import RESET, is_last, pending

logger = logging.getLogger(__name__)

FINISHED_CODE = 1000


class Socket(Protocol):
    """One accepted WebSocket and the attachment kept with it."""

    @property
    def attachment(self) -> dict[str, Any]: ...

    def attach(self, value: dict[str, Any]) -> None: ...

    def send(self, text: str) -> None: ...

    def close(self, code: int, reason: str) -> None: ...


class ChatSockets:
    def __init__(self, log: ChatLog, sockets: Any) -> None:
        """`sockets` returns the object's open sockets, as `Socket`s."""
        self._log = log
        self._sockets = sockets
        self._pushing = False
        self._dirty = False
        # One push at a time, so two never read the same cursor and send a frame twice.
        self._lock = asyncio.Lock()

    async def announce(self) -> None:
        """The chat kept an event: every socket is sent what it has not had. Announcements that come
        while the sockets are being sent to are served by the same round, never by a second one at
        the same time."""
        self._dirty = True
        if self._pushing:
            return
        self._pushing = True
        try:
            while self._dirty:
                self._dirty = False
                for socket in self._sockets():
                    await self.push(socket)
        finally:
            self._pushing = False

    async def welcome(self, socket: Socket) -> None:
        """A socket was opened: it is sent what it missed, or told to start again if its cursor is
        beyond the chat."""
        kept = socket.attachment
        if kept["cursor"] > await self._log.last_seq(kept["chat"]):
            async with self._lock:
                self._tell_reset(socket)
            return
        await self.push(socket)

    @staticmethod
    def _tell_reset(socket: Socket) -> None:
        socket.send(json.dumps(RESET))
        socket.close(FINISHED_CODE, "reset")

    async def push(self, socket: Socket) -> None:
        """Sends one socket the frames after its cursor, and closes it after the end of its turn. A
        socket that cannot be written to is its own loss: the page opens another from its cursor."""
        async with self._lock:
            kept = socket.attachment
            try:
                frames = await pending(
                    self._log, kept["chat"], kept["turn"], kept["cursor"]
                )
                if not frames:
                    return
                for frame in frames:
                    socket.send(json.dumps(frame))
                socket.attach({**kept, "cursor": frames[-1]["seq"]})
                if is_last(frames[-1]):
                    socket.close(FINISHED_CODE, "finished")
            except Exception:
                logger.warning(
                    "A socket of chat %s was not sent to", kept["chat"], exc_info=True
                )

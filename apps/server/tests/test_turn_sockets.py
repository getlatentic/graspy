"""The sockets a chat's object holds: sent what they have not had, each from its own cursor."""

import asyncio
import json

import pytest

from app.chatlog import kinds
from app.chatlog.log import ChatLog
from app.local_d1 import LocalD1
from app.turns.sockets import ChatSockets

CHAT = "c"


class FakeSocket:
    def __init__(self, turn="t1", cursor=0) -> None:
        self.attachment = {"chat": CHAT, "turn": turn, "cursor": cursor}
        self.sent: list[dict] = []
        self.closed: tuple[int, str] | None = None

    def attach(self, value) -> None:
        self.attachment = value

    def send(self, text: str) -> None:
        self.sent.append(json.loads(text))

    def close(self, code: int, reason: str) -> None:
        self.closed = (code, reason)


@pytest.fixture
def log():
    return ChatLog(LocalD1())


def sockets_of(log, *held) -> ChatSockets:
    return ChatSockets(log, lambda: list(held))


async def keep(log, kind, **data):
    return await log.append(CHAT, kind, {"turn": "t1", **data}, 1_000)


async def test_a_socket_is_sent_what_the_turn_kept_since_its_cursor(log):
    started = await keep(log, kinds.TURN_STARTED, job={})
    socket = FakeSocket(cursor=started)
    await keep(log, kinds.TEXT, text="Fort")
    await keep(log, kinds.TEXT, text="y-two")

    await sockets_of(log, socket).announce()

    assert [f["text"] for f in socket.sent] == ["Fort", "y-two"]
    assert socket.attachment["cursor"] == socket.sent[-1]["seq"]
    assert socket.closed is None


async def test_a_socket_is_sent_each_frame_once(log):
    started = await keep(log, kinds.TURN_STARTED, job={})
    socket = FakeSocket(cursor=started)
    sockets = sockets_of(log, socket)
    await keep(log, kinds.TEXT, text="Fort")
    await sockets.announce()
    await sockets.announce()
    await keep(log, kinds.TEXT, text="y")
    await sockets.announce()

    assert [f["text"] for f in socket.sent] == ["Fort", "y"]
    assert [f["prev"] for f in socket.sent] == [started, socket.sent[0]["seq"]]


async def test_each_socket_is_sent_from_its_own_cursor(log):
    started = await keep(log, kinds.TURN_STARTED, job={})
    first = await keep(log, kinds.TEXT, text="One")
    await keep(log, kinds.TEXT, text="Two")
    behind, ahead = FakeSocket(cursor=started), FakeSocket(cursor=first)

    await sockets_of(log, behind, ahead).announce()

    assert [f["text"] for f in behind.sent] == ["One", "Two"]
    assert [f["text"] for f in ahead.sent] == ["Two"]


async def test_the_end_of_the_turn_is_sent_and_the_socket_closed(log):
    started = await keep(log, kinds.TURN_STARTED, job={})
    socket = FakeSocket(cursor=started)
    await keep(log, kinds.TURN_FINISHED, status="ok", reply={"answer": "Yes."})

    await sockets_of(log, socket).announce()

    assert socket.sent[-1]["kind"] == "turn.finished"
    assert socket.closed == (1000, "finished")


async def test_a_socket_opened_with_a_cursor_beyond_the_chat_is_told_to_start_again(
    log,
):
    await keep(log, kinds.TURN_STARTED, job={})
    socket = FakeSocket(cursor=50)

    await sockets_of(log, socket).welcome(socket)

    assert socket.sent == [{"kind": "reset"}]
    assert socket.closed == (1000, "reset")


async def test_a_socket_opened_after_the_turn_finished_is_sent_the_rest_and_closed(log):
    started = await keep(log, kinds.TURN_STARTED, job={})
    await keep(log, kinds.TEXT, text="Yes")
    await keep(log, kinds.TURN_FINISHED, status="ok", reply={"answer": "Yes."})
    socket = FakeSocket(cursor=started)

    await sockets_of(log, socket).welcome(socket)

    assert [f["kind"] for f in socket.sent] == ["text", "turn.finished"]
    assert socket.closed == (1000, "finished")


async def test_announcements_made_while_sending_are_served_by_one_round(log):
    """Two rounds at once would read the same cursor and send a frame twice."""
    started = await keep(log, kinds.TURN_STARTED, job={})
    socket = FakeSocket(cursor=started)
    await keep(log, kinds.TEXT, text="Yes")
    sockets = sockets_of(log, socket)

    await asyncio.gather(*(sockets.announce() for _ in range(5)))

    assert [f["text"] for f in socket.sent] == ["Yes"]


class BrokenSocket(FakeSocket):
    def send(self, text: str) -> None:
        raise RuntimeError("The socket is closed")


async def test_a_socket_that_cannot_be_sent_to_does_not_stop_the_others(log):
    started = await keep(log, kinds.TURN_STARTED, job={})
    await keep(log, kinds.TEXT, text="Yes")
    broken, whole = BrokenSocket(cursor=started), FakeSocket(cursor=started)

    await sockets_of(log, broken, whole).announce()

    assert [f["text"] for f in whole.sent] == ["Yes"]
    assert broken.attachment["cursor"] == started


async def test_a_socket_opened_while_the_object_announces_is_sent_each_frame_once(log):
    started = await keep(log, kinds.TURN_STARTED, job={})
    await keep(log, kinds.TEXT, text="Yes")
    socket = FakeSocket(cursor=started)
    sockets = sockets_of(log, socket)

    await asyncio.gather(sockets.welcome(socket), sockets.announce())

    assert [f["text"] for f in socket.sent] == ["Yes"]

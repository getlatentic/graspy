"""The Worker's gate for a turn's WebSocket: the URL it reads and the session it checks."""

import pytest

from app.cloudflare_sockets import PROTOCOL, session_of, socket_target
from app.security.session import issue

SECRET = "socket-test-secret"
CHAT = "5b3f3a52-1c1e-4e0e-9f0e-2f5d6c9a7b11"
TURN = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"


@pytest.mark.parametrize(
    ("url", "target"),
    [
        (f"https://api/api/chats/{CHAT}/turns/{TURN}/socket", (CHAT, TURN, 0)),
        (
            f"https://api/api/chats/{CHAT}/turns/{TURN}/socket?after=17",
            (CHAT, TURN, 17),
        ),
        (
            f"https://api/api/chats/{CHAT}/turns/{TURN}/socket?after=-1",
            (CHAT, TURN, -1),
        ),
        (f"https://api/api/chats/{CHAT}/turns/{TURN}/socket?after=x", (CHAT, TURN, -1)),
    ],
)
def test_the_chat_turn_and_cursor_come_from_the_url(url, target):
    assert socket_target(url) == target


@pytest.mark.parametrize(
    "url",
    [
        f"https://api/api/chats/{CHAT}/turns/{TURN}/events",
        f"https://api/api/chats/{CHAT}/turns/{TURN}/socket/x",
        f"https://api/api/chats/short/turns/{TURN}/socket",
        "https://api/api/health",
    ],
)
def test_any_other_url_is_not_a_socket(url):
    assert socket_target(url) is None


def test_the_session_is_the_token_offered_after_our_protocol():
    token = issue(SECRET, learner="dev1").token

    session = session_of(f"{PROTOCOL}, {token}", SECRET)

    assert session is not None and session.learner == "dev1"


@pytest.mark.parametrize(
    "offered",
    [
        None,
        "",
        PROTOCOL,
        "other, token",
        f"{PROTOCOL}, not-a-token",
        f"{PROTOCOL}, a, b",
    ],
)
def test_no_session_without_ours_and_a_valid_token(offered):
    assert session_of(offered, SECRET) is None


def test_a_token_of_another_secret_is_refused():
    token = issue("another-secret").token

    assert session_of(f"{PROTOCOL}, {token}", SECRET) is None

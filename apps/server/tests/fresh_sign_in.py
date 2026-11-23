"""The `auth_time` of a Google sign-in just made, as the test stand-ins give it: later than the one
before (it never goes backwards, whatever a test does to the clock), and later than any session
already made, as a real sign-in is. A token proves once, so two sign-ins in a test must not look
like the same one, and one made in the same second as a session must not look older than it."""

import time

_last = 0
_offsets: dict[int, int] = {}


def reset() -> None:
    """Each test starts again, so the sign-ins of one are seconds ahead, not hundreds."""
    global _last
    _last = 0
    _offsets.clear()


def fresh_auth_time() -> int:
    global _last
    _last = max(_last + 1, int(time.time()) + 1)
    return _last


def auth_time_at(offset: int) -> int:
    """A sign-in made `offset` seconds from now, and the same second every time it is asked for in
    one test: a token is one sign-in, whatever the clock does between two requests with it."""
    return _offsets.setdefault(offset, int(time.time()) + offset)

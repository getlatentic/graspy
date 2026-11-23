"""The `auth_time` of a Google sign-in just made, as the test stand-ins give it: later each time
(and later than any session already made), as a real sign-in is. A token proves once, so two
sign-ins in a test must not look like the same one."""

import itertools
import time

_counter = itertools.count(1)


def reset() -> None:
    """Each test starts again, so the sign-ins of one are seconds ahead, not hundreds."""
    global _counter
    _counter = itertools.count(1)


def fresh_auth_time() -> int:
    return int(time.time()) + next(_counter)

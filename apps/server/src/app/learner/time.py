import time


def now_ms() -> int:
    """Milliseconds since the epoch, as the learner's app keeps time."""
    return int(time.time() * 1000)

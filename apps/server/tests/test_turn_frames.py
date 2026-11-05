"""A turn's frames: what a client is sent, with the cursor that lets it ask again from where it was."""

import pytest

from app.chatlog import kinds
from app.chatlog.log import ChatLog
from app.local_d1 import LocalD1
from app.turns.frames import RESET, frame, is_last, pending, read

CHAT = "c"


@pytest.fixture
def log():
    return ChatLog(LocalD1())


async def keep(log, kind, **data):
    return await log.append(CHAT, kind, data, 1_000)


async def a_turn(log, turn="t1"):
    """Events of two turns, written as two runs would write them, with ones no client is sent."""
    await keep(log, kinds.TURN_STARTED, turn=turn, job={})
    await keep(log, kinds.USER, turn=turn, text="Is it 7?")
    await keep(log, kinds.TURN_RESUMED, turn=turn, run=1)
    await keep(log, kinds.TEXT, turn=turn, run=1, text="Yes")
    await keep(log, kinds.TOOL_STARTED, turn=turn, run=1, tool="calculate")
    await keep(log, kinds.TOOL, turn=turn, run=1, tool="calculate")
    await keep(log, kinds.TEXT, turn="other", run=1, text="not this turn's")
    await keep(
        log,
        kinds.TURN_FINISHED,
        turn=turn,
        status="ok",
        reply={"answer": "Yes.", "data": {}},
    )


async def test_the_frames_of_a_turn_chain_from_the_cursor(log):
    await a_turn(log)

    frames = await pending(log, CHAT, "t1", 1)

    assert [(f["seq"], f["prev"], f["kind"]) for f in frames] == [
        (3, 1, "turn.resumed"),
        (4, 3, "text"),
        (5, 4, "tool.started"),
        (6, 5, "tool"),
        (8, 6, "turn.finished"),
    ]
    assert frames[1]["text"] == "Yes" and frames[2]["tool"] == "calculate"
    assert frames[-1]["reply"]["answer"] == "Yes." and is_last(frames[-1])


async def test_asking_again_from_a_seq_gives_the_frames_after_it(log):
    await a_turn(log)
    again = await pending(log, CHAT, "t1", 4)

    assert [f["seq"] for f in again] == [5, 6, 8]
    assert again[0]["prev"] == 4


async def test_a_finished_turn_that_was_all_read_has_no_frames_after_its_end(log):
    await a_turn(log)

    assert await pending(log, CHAT, "t1", 8) == []


async def test_a_frame_names_only_what_the_client_needs(log):
    await a_turn(log)
    [event] = await log.since(CHAT, 3, 1, (kinds.TEXT,))

    assert frame(event, 3) == {"seq": 4, "prev": 3, "kind": "text", "text": "Yes"}


async def test_read_follows_a_turn_to_its_end(log):
    await a_turn(log)

    frames = [f async for f in read(log, CHAT, "t1", 1, deadline_ms=1_000)]

    assert [f["seq"] for f in frames] == [3, 4, 5, 6, 8]
    assert [f["prev"] for f in frames] == [1, 3, 4, 5, 6]


async def test_a_cursor_beyond_the_chat_is_told_to_start_again(log):
    await a_turn(log)

    frames = [f async for f in read(log, CHAT, "t1", 99, deadline_ms=1_000)]

    assert frames == [RESET]


async def test_a_turn_not_finished_in_the_window_ends_the_read_with_a_timeout(log):
    await keep(log, kinds.TURN_STARTED, turn="t1", job={})
    now = [0]

    def clock():
        now[0] += 600
        return now[0]

    with pytest.raises(TimeoutError):
        [f async for f in read(log, CHAT, "t1", 1, deadline_ms=1_000, clock=clock)]

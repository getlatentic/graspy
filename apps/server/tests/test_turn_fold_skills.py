"""The skills a turn loaded, as its events say, and what a client is and is not sent of them."""

import pytest

from app.chatlog import kinds
from app.chatlog.log import ChatLog
from app.local_d1 import LocalD1
from app.turns.fold import FOLDED, folded
from app.turns.frames import pending

CHAT = "c"
MISTAKE = "explaining-a-mistake"
EXAMPLE = "worked-example"


@pytest.fixture
def log():
    return ChatLog(LocalD1())


async def keep(log, kind, **data):
    return await log.append(CHAT, kind, {"turn": "t", **data}, 1_000)


async def skills_of(log) -> tuple[str, ...]:
    return folded(await log.since(CHAT, 0, 500, FOLDED))["t"].skills


async def begun(log):
    await keep(log, kinds.TURN_STARTED, job={})
    await keep(log, kinds.TURN_RESUMED, run=1)


async def test_the_skills_a_run_loaded_are_in_the_order_loaded_once_each(log):
    await begun(log)
    for name in (MISTAKE, EXAMPLE, MISTAKE):
        await keep(log, kinds.SKILL_LOADED, run=1, skill=name)

    assert await skills_of(log) == (MISTAKE, EXAMPLE)


async def test_a_tool_event_without_a_skill_loads_none(log):
    await begun(log)
    await keep(log, kinds.TOOL_STARTED, run=1, tool="calculate")
    await keep(log, kinds.TOOL, run=1, tool="calculate")

    assert await skills_of(log) == ()


async def test_a_withdrawn_round_withdraws_its_skills(log):
    await begun(log)
    await keep(log, kinds.SKILL_LOADED, run=1, skill=MISTAKE)
    await keep(log, kinds.ROUND_ABORTED, run=1, reason="rewritten")
    await keep(log, kinds.SKILL_LOADED, run=1, skill=EXAMPLE)

    assert await skills_of(log) == (EXAMPLE,)


async def test_a_run_that_begins_again_starts_with_no_skills(log):
    await begun(log)
    await keep(log, kinds.SKILL_LOADED, run=1, skill=MISTAKE)
    await keep(log, kinds.TURN_RESUMED, run=2)

    assert await skills_of(log) == ()


async def test_a_client_is_not_sent_the_skill_a_turn_loaded(log):
    await begun(log)
    await keep(log, kinds.SKILL_LOADED, run=1, skill=MISTAKE)
    await keep(log, kinds.TURN_FINISHED, status="ok", reply={})

    frames = await pending(log, CHAT, "t", 0)

    assert "skill.loaded" not in {f["kind"] for f in frames}
    assert all("skill" not in f for f in frames)

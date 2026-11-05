"""Who may start, read and stop a chat's turns."""

import pytest

from app.chatlog import kinds
from app.chatlog.log import ChatLog
from app.local_d1 import LocalD1
from app.turns.access import may_follow, may_start


@pytest.fixture
def log():
    return ChatLog(LocalD1())


async def begun_by(log, learner, chat="c"):
    await log.append(
        chat, kinds.TURN_STARTED, {"turn": "t1", "job": {"learner": learner}}, 1
    )


async def test_a_new_chat_may_be_started_by_anyone_and_followed_by_no_one(log):
    assert await may_start(log, "c", "dev1")
    assert not await may_follow(log, "c", "dev1")


async def test_the_learner_who_began_a_chat_may_start_and_follow(log):
    await begun_by(log, "dev1")

    assert await may_start(log, "c", "dev1") and await may_follow(log, "c", "dev1")


async def test_another_learner_may_do_neither(log):
    await begun_by(log, "dev1")

    assert not await may_start(log, "c", "dev2")
    assert not await may_follow(log, "c", "dev2")


async def test_a_chat_is_judged_by_its_first_turn_not_a_later_one(log):
    await begun_by(log, "dev1")
    await log.append(
        "c", kinds.TURN_STARTED, {"turn": "t2", "job": {"learner": "dev2"}}, 2
    )

    assert not await may_follow(log, "c", "dev2")

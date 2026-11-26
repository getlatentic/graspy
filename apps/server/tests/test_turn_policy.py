"""A turn makes one change to the plan; each call is told what was and was not done."""

import pytest

from app.agent.cards import PathStep
from app.agent.refusal import refusal
from app.agent.reply import (
    AddedPath,
    AddPaths,
    AddTopic,
    ChangeSubjects,
    OpenSubject,
    OpenTopic,
    Outcome,
    RebuildPlan,
)
from app.agent.turn_policy import ALREADY, ONE_CHANGE, admit

WRITES = [
    ChangeSubjects(add=["Chess"], remove=[]),
    ChangeSubjects(add=[], remove=["History"]),
    RebuildPlan(),
    AddTopic(subject_slug="a", subject="A", topic="Surds"),
    AddPaths(
        paths=[
            AddedPath(
                subject="Astronomy",
                goal="Astronomy",
                slug="astronomy",
                steps=[PathStep(title="Stars", level="SS 1")],
            )
        ]
    ),
]
OPENS = [
    OpenSubject(subject_slug="a", subject="A"),
    OpenTopic(subject_slug="a", topic_index=0, topic="T"),
]
WRITE_IDS = ["add", "drop", "rebuild", "topic", "paths"]
OPEN_IDS = ["open-subject", "open-topic"]


def call(*actions) -> Outcome:
    return Outcome(told={"done": "ok"}, actions=tuple(actions))


@pytest.mark.parametrize("first", WRITES, ids=WRITE_IDS)
@pytest.mark.parametrize("second", WRITES, ids=WRITE_IDS)
def test_a_second_different_write_in_a_turn_is_refused_and_the_call_says_so(
    first, second
):
    if first == second:
        pytest.skip("the same call twice is answered as already done")
    actions = []
    admit(actions, call(first))

    told = admit(actions, call(second))

    assert told == refusal(ONE_CHANGE)
    assert actions == [first]


@pytest.mark.parametrize("write", WRITES, ids=WRITE_IDS)
def test_the_same_call_twice_is_answered_as_already_done(write):
    actions = []
    admit(actions, call(write))

    told = admit(actions, call(write))

    assert told == ALREADY
    assert actions == [write]


@pytest.mark.parametrize("opened", OPENS, ids=OPEN_IDS)
@pytest.mark.parametrize("write", WRITES, ids=WRITE_IDS)
def test_going_somewhere_comes_with_a_write_in_either_order(write, opened):
    """ "Go to Maths and add surds": the open changes nothing, so it takes no slot."""
    actions = []
    admit(actions, call(opened))
    assert admit(actions, call(write)) == {"done": "ok"}
    assert actions == [opened, write]

    actions = []
    admit(actions, call(write))
    assert admit(actions, call(opened)) == {"done": "ok"}
    assert actions == [write, opened]


def test_of_two_opens_the_last_counts_and_a_write_is_kept():
    first, last = OPENS
    write = WRITES[3]
    actions = []

    admit(actions, call(first))
    admit(actions, call(write))
    admit(actions, call(last))

    assert actions == [write, last]


def test_a_call_that_changes_nothing_is_told_as_it_was():
    actions = []

    told = admit(actions, Outcome(told={"note": "nothing"}))

    assert told == {"note": "nothing"}
    assert actions == []


def test_a_call_is_all_or_nothing():
    """Nothing of a call is kept when any of its actions is refused."""
    actions = []
    admit(actions, call(WRITES[3]))

    told = admit(actions, call(OPENS[0], WRITES[0]))

    assert told == refusal(ONE_CHANGE)
    assert actions == [WRITES[3]]

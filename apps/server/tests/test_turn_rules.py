"""A turn's state, folded from its events, and the rule that says whether it runs again."""

import pytest

from app.chatlog import kinds
from app.chatlog.log import Event
from app.turns.fold import folded
from app.turns.rules import (
    GIVE_UP_AFTER_MS,
    MAX_STALLED_RUNS,
    MAX_TURN_MS,
    NO_PROGRESS,
    STALLED,
    UNREADABLE,
    UNSAFE_TO_REPEAT,
    GiveUp,
    Run,
    next_step,
)

JOB = {"message": "hi"}


def events(*spec) -> list[Event]:
    """Events from (kind, data) pairs, a second apart."""
    return [
        Event("c", n + 1, kind, {"turn": "t", **data}, 1_000 * (n + 1))
        for n, (kind, data) in enumerate(spec)
    ]


def started():
    return (kinds.TURN_STARTED, {"job": JOB})


def run(n):
    return (kinds.TURN_RESUMED, {"run": n})


def text():
    return (kinds.TEXT, {"text": "words"})


def state_of(*spec):
    return folded(events(*spec))["t"]


def test_a_turn_not_yet_run_has_no_runs():
    state = state_of(started())

    assert (state.runs, state.stalled_runs, state.finished) == (0, 0, None)
    assert state.job == JOB and state.started_at == 1_000


def test_a_run_that_kept_something_is_not_stalled():
    state = state_of(started(), run(1), text())

    assert (state.runs, state.stalled_runs, state.progressed_at) == (1, 0, 3_000)


def test_a_run_that_was_cut_off_before_it_kept_anything_is_stalled():
    assert state_of(started(), run(1)).stalled_runs == 1


def test_stalled_runs_are_counted_from_the_latest_and_progress_resets_them():
    two = state_of(started(), run(1), run(2))
    reset = state_of(started(), run(1), run(2), text(), run(3))

    assert two.stalled_runs == 2
    assert reset.stalled_runs == 1


def test_a_finished_turn_says_how():
    state = state_of(started(), run(1), (kinds.TURN_FINISHED, {"status": "ok"}))

    assert state.finished.data["status"] == "ok"


def test_the_tools_a_run_called_and_the_ones_that_answered():
    state = state_of(
        started(),
        run(1),
        (kinds.TOOL_STARTED, {"tool": "calculate"}),
        (kinds.TOOL, {"tool": "calculate"}),
        (kinds.TOOL_STARTED, {"tool": "give_practice"}),
    )

    assert state.open_tools == ("give_practice",)


def test_a_new_run_forgets_what_the_last_one_left_open():
    state = state_of(
        started(), run(1), (kinds.TOOL_STARTED, {"tool": "calculate"}), run(2)
    )

    assert state.open_tools == ()


def test_the_reason_a_round_was_aborted_is_kept():
    state = state_of(
        started(), run(1), (kinds.ROUND_ABORTED, {"reason": "TimeoutError"})
    )

    assert state.last_cause == "TimeoutError"


def test_events_of_other_turns_and_events_with_no_turn_are_not_this_turns():
    mixed = events(started(), run(1)) + [
        Event("c", 9, kinds.TURN_STARTED, {"turn": "other", "job": JOB}, 9_000),
        Event("c", 10, kinds.TEXT, {"text": "no turn"}, 10_000),
    ]

    states = folded(mixed)

    assert sorted(states) == ["other", "t"] and states["t"].runs == 1


def always(_tool: str) -> bool:
    return True


def test_a_turn_with_runs_left_is_run():
    assert next_step(state_of(started(), run(1), run(2)), 5_000, always) == Run()


def test_a_turn_whose_last_runs_kept_nothing_is_given_up_on():
    spec = [started(), *(run(n) for n in range(1, MAX_STALLED_RUNS + 1))]

    assert next_step(state_of(*spec), 9_000, always) == GiveUp(NO_PROGRESS)


def test_a_turn_that_kept_nothing_for_five_minutes_is_given_up_on():
    state = state_of(started(), run(1), text())

    assert next_step(state, 3_000 + GIVE_UP_AFTER_MS, always) == Run()
    assert next_step(state, 3_001 + GIVE_UP_AFTER_MS, always) == GiveUp(STALLED)


def test_a_first_run_is_not_given_up_on_for_the_time_before_it_began():
    assert next_step(state_of(started()), 10 * GIVE_UP_AFTER_MS, always) == Run()


def test_a_run_cut_off_in_a_tool_that_must_not_be_sent_twice_ends_the_turn():
    state = state_of(started(), run(1), (kinds.TOOL_STARTED, {"tool": "pay"}))

    assert next_step(state, 5_000, lambda tool: tool != "pay") == GiveUp(
        UNSAFE_TO_REPEAT
    )
    assert next_step(state, 5_000, always) == Run()


def test_a_turn_whose_job_cannot_be_read_ends():
    state = folded(events((kinds.TURN_STARTED, {})))["t"]

    assert next_step(state, 5_000, always) == GiveUp(UNREADABLE)


@pytest.mark.parametrize("stalled", range(MAX_STALLED_RUNS))
def test_a_turn_is_run_until_its_stalled_runs_reach_the_limit(stalled):
    spec = [started(), *(run(n) for n in range(1, stalled + 1))]

    assert next_step(state_of(*spec), 9_000, always) == Run()


def test_a_turn_that_keeps_a_little_each_run_is_still_given_up_on_when_it_is_old():
    """A model that writes a few words and hangs, run after run, never stalls: the turn's age ends it."""
    late = 1_000 + MAX_TURN_MS
    spec = [(kinds.TURN_STARTED, {"job": JOB}, 1_000)]
    for n in range(1, 6):
        at = late - 60_000 + n
        spec += [(kinds.TURN_RESUMED, {"run": n}, at), (kinds.TEXT, {"text": "w"}, at)]
    state = folded(
        Event("c", i + 1, kind, {"turn": "t", **data}, at)
        for i, (kind, data, at) in enumerate(spec)
    )["t"]

    assert state.stalled_runs == 0
    assert next_step(state, late, always) == Run()
    assert next_step(state, late + 1, always) == GiveUp(STALLED)

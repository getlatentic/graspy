"""How an answer that is not the plan's own question is read: a recording nobody could hear, and the questions
asked on the way back to the plan's own (the check's answer said after the teacher, a list's item asked for or
said, and the small teaching questions of a skill).
"""

from datetime import date

from .curriculum import (
    ECHO_PREFIX,
    PROBE_PREFIX,
    REMEDY_PREFIX,
    SHOW_PREFIX,
    LessonEvent,
    echoable,
    load_skills,
    remedy_steps,
)
from .evidence import Evidence
from .progress_state import RECALL_ATTEMPTS, UNHEARD_LIMIT, PlanProgress


def record_unheard(
    state: PlanProgress,
    item: Evidence,
    streaks: dict[tuple[str, str, date], int],
    today: date,
) -> None:
    """A recording that could not be marked: the step is asked again, and nothing is held against the child.

    It is no miss, it owes no feedback, and it is not a try. Only a child who cannot be heard again and
    again leaves the lesson for tomorrow, since the lesson cannot go on without hearing them."""
    key = (item.plan_id, f"{item.event_id}#unheard", item.day)
    streaks[key] = streaks.get(key, 0) + 1
    if item.day != today:
        return
    state.done_today.discard(item.event_id)
    state.retry_today.add(item.event_id)
    if streaks[key] >= UNHEARD_LIMIT:
        state.paused_days.add(item.day)
        state.paused_today = True


def _showed_nothing(item: Evidence) -> bool:
    """Whether a try drew nothing right from the child: not knowing and a wrong answer are the same
    evidence that the skill is not there. A recording nobody could hear is not a try, and never gets here."""
    return (
        item.decision != "correct"
        and not item.facts_right
        and not (item.result or {}).get("said")
    )


def is_side_step(item: Evidence) -> bool:
    return bool(item.prompt_id) and item.prompt_id.startswith(
        (ECHO_PREFIX, PROBE_PREFIX, SHOW_PREFIX, REMEDY_PREFIX)
    )


def record_side_step(
    state: PlanProgress,
    event: LessonEvent,
    item: Evidence,
    streaks: dict[tuple[str, str, date], int],
    today: date,
) -> None:
    """An answer to a question asked on the way back to the plan's own. It earns nothing towards the event,
    changes nothing about it (it is not done, not owed, not a try), and only says how the way back is going.
    One that names a break the child's list did not have is ignored: it was claimed, not asked."""
    if item.day != today or item.decision is None:
        return
    prompt = item.prompt_id
    broke_at = prompt.rpartition(".")[2]
    if prompt.startswith(REMEDY_PREFIX):
        if not _remedy_step_asked(state, item.event_id, broke_at):
            return
    elif not prompt.startswith(ECHO_PREFIX) and broke_at != state.resume_at.get(
        item.event_id
    ):
        return
    if item.unheard:
        key = (item.plan_id, f"{item.event_id}#unheard", item.day)
        streaks[key] = streaks.get(key, 0) + 1
        if streaks[key] >= UNHEARD_LIMIT:
            state.paused_days.add(item.day)
            state.paused_today = True
        return
    streaks[(item.plan_id, f"{item.event_id}#unheard", item.day)] = 0
    if prompt.startswith(ECHO_PREFIX):
        _record_echo(state, item, today)
    elif prompt.startswith(REMEDY_PREFIX):
        _record_remedy(state, event, item)
    elif prompt.startswith(PROBE_PREFIX):
        state.probed[item.event_id] = broke_at
        state.probe_right[item.event_id] = item.decision == "correct"
    else:
        state.shown[item.event_id] = broke_at


def _remedy_step_asked(state: PlanProgress, event_id: str, claimed: str) -> bool:
    """Whether a remedy question names the step being asked now, before the check is asked again."""
    return (
        claimed.isdigit()
        and int(claimed) == state.remedy_done.get(event_id, 0)
        and event_id not in state.rechecked
    )


def _record_remedy(state: PlanProgress, event: LessonEvent, item: Evidence) -> None:
    """One of the skill's small teaching questions was answered. A right answer goes on to the next; a wrong
    one is met with the step's hints and then the answer, and once told, goes on too. When the last is done,
    the check is asked again to see what that did. A question not the one being asked is ignored."""
    steps = remedy_steps(event, load_skills())
    done = state.remedy_done.get(item.event_id, 0)
    if done >= len(steps):
        return
    if item.decision == "correct":
        state.remedy_misses[item.event_id] = 0
        state.remedy_done[item.event_id] = done + 1
    else:
        misses = state.remedy_misses.get(item.event_id, 0) + 1
        state.remedy_misses[item.event_id] = misses
        _, _, hints = steps[done].in_language("en")
        if misses > len(hints):  # the hints are used and the answer has been told
            state.remedy_misses[item.event_id] = 0
            state.remedy_done[item.event_id] = done + 1
    if state.remedy_done.get(item.event_id, 0) >= len(steps):
        state.echoed.add(item.event_id)
        state.recheck_due.add(item.event_id)


def _record_echo(state: PlanProgress, item: Evidence, today: date) -> None:
    """The check's answer was said after the teacher: it is asked again, to see what that did."""
    if (
        item.day == today
        and item.decision is not None
        and item.event_id not in state.rechecked
    ):
        state.echoed.add(item.event_id)
        state.recheck_due.add(item.event_id)


def record_recall(
    state: PlanProgress,
    event: LessonEvent,
    item: Evidence,
    streaks: dict[tuple[str, str, date], int],
    today: date,
) -> None:
    """What a try at the check of what the lesson builds on says about that skill.

    Nothing right twice running owes the child the answer said after the teacher. A try after that
    which still draws nothing leaves the lesson for tomorrow: the child is not taught on top of a
    skill they do not have, and is not sent away with a failure either."""
    key = (item.plan_id, f"{item.event_id}#blank", item.day)
    blank = _showed_nothing(item)
    streaks[key] = streaks.get(key, 0) + 1 if blank else 0
    if item.day != today:
        return
    state.blank_recall[item.event_id] = streaks[key]
    if item.event_id in state.recheck_due:
        state.recheck_due.discard(item.event_id)
        state.rechecked.add(item.event_id)
        if blank:
            state.paused_days.add(item.day)
            state.paused_today = True


def echo_owed(state: PlanProgress, event: LessonEvent) -> bool:
    return (
        echoable(event)
        and state.blank_recall.get(event.id, 0) >= RECALL_ATTEMPTS
        and event.id not in state.echoed
    )

"""What a tool call adds to the turn's actions for the app. A turn makes one
change to the learner's plan: a second is refused, and the call is told so, so
the tutor never tells the learner of more than reaches them. Going to a subject
or a lesson changes nothing, so it comes with a change. The courses of
propose_path are one change however many calls or goals carry them."""

from __future__ import annotations

from .courses import listed, shown_told
from .refusal import refusal
from .reply import (
    MAX_PATH_GOALS,
    Action,
    OpenSubject,
    OpenTopic,
    Outcome,
    ProposePath,
)
from .subject_match import normalise

ONE_CHANGE = (
    "Done one change to the learner's plan in this turn already, so this one is "
    "not made. Tell them, and ask for the next in a new message"
)
FULL = (
    "The learner's plan is full, so no course can be offered: they have to drop "
    "a subject first"
)
ALREADY = {"note": "Already done in this turn: nothing more is needed."}


def _is_open(action: Action) -> bool:
    return isinstance(action, OpenTopic | OpenSubject)


def admit(actions: list[Action], result: Outcome, room: int) -> dict:
    """Puts the call's actions among the turn's and returns what the model
    reads. `room` is how many more subjects the plan can hold."""
    if not result.actions:
        return result.told
    if any(isinstance(action, ProposePath) for action in result.actions):
        return _admit_courses(actions, result, room)
    staged = list(actions)
    for action in result.actions:
        if _is_open(action):
            staged = [a for a in staged if not _is_open(a)]
        elif action in staged:
            return ALREADY
        elif any(not _is_open(a) for a in staged):
            return refusal(ONE_CHANGE)
        staged.append(action)
    actions[:] = staged
    return result.told


def _admit_courses(actions: list[Action], result: Outcome, room: int) -> dict:
    if any(not (_is_open(a) or isinstance(a, ProposePath)) for a in actions):
        return refusal(ONE_CHANGE)
    if room <= 0:
        return refusal(FULL)
    limit = min(MAX_PATH_GOALS, room)
    offered = {normalise(a.goal) for a in actions if isinstance(a, ProposePath)}
    new: list[ProposePath] = []
    left_out: list[str] = []
    for action in result.actions:
        if not isinstance(action, ProposePath) or normalise(action.goal) in offered:
            continue
        if len(offered) >= limit:
            left_out.append(action.goal)
            continue
        offered.add(normalise(action.goal))
        new.append(action)
    if not new and not left_out:
        return ALREADY
    if not new:
        return refusal(_left_out(left_out, limit))
    actions.extend(new)
    told = dict(result.told)
    if len(new) != len(result.actions):
        told["shown"] = shown_told([a.goal for a in new])
    if left_out:
        told["not_offered"] = _left_out(left_out, limit)
    return told


def _left_out(goals: list[str], limit: int) -> str:
    return (
        f"Not offered, since a turn offers at most {limit} "
        f"{'course' if limit == 1 else 'courses'} here: {listed(goals)}. "
        "Tell the learner to ask for them next."
    )

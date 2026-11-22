"""What a tool call adds to the turn's actions for the app. A turn makes one
change to the learner's plan: a second is refused, and the call is told so, so
the tutor never tells the learner of more than reaches them. The courses of
propose_path are one change however many calls or goals carry them."""

from __future__ import annotations

from .courses import listed, shown_told
from .refusal import refusal
from .reply import MAX_PATH_GOALS, Action, Outcome, ProposePath
from .subject_match import normalise

ONE_CHANGE = (
    "Done one change to the learner's plan in this turn already, so this one is "
    "not made. Tell them, and ask for the next in a new message"
)


def admit(actions: list[Action], result: Outcome, room: int) -> dict:
    """Puts the call's actions among the turn's and returns what the model
    reads. `room` is how many more subjects the plan can hold."""
    if not result.actions:
        return result.told
    if any(isinstance(action, ProposePath) for action in result.actions):
        return _admit_courses(actions, result, room)
    if actions:
        return refusal(ONE_CHANGE)
    actions.extend(result.actions)
    return result.told


def _admit_courses(actions: list[Action], result: Outcome, room: int) -> dict:
    if any(not isinstance(action, ProposePath) for action in actions):
        return refusal(ONE_CHANGE)
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
        return {
            "note": "These courses are already offered to the learner in this turn."
        }
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
        f"Not offered, since the learner's plan has room for {limit} more "
        f"{'course' if limit == 1 else 'courses'} in a turn: {listed(goals)}. "
        "Tell the learner to ask for them next."
    )

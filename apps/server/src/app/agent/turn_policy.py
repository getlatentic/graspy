"""What a tool call adds to the turn's actions for the app. A turn makes one
change to the learner's plan: a second is refused, and the call is told so, so
the tutor never tells the learner of more than reaches them. Going to a subject
or a lesson changes nothing, and neither does saving what the learner says of
their school, so they come with a change. The courses a learner chooses on a
path card are one change, however many they chose."""

from __future__ import annotations

from .refusal import refusal
from .reply import Action, OpenSubject, OpenTopic, Outcome, SetDetails

ONE_CHANGE = (
    "Done one change to the learner's plan in this turn already, so this one is "
    "not made. Tell them, and ask for the next in a new message"
)
ALREADY = {"note": "Already done in this turn: nothing more is needed."}


def _is_open(action: Action) -> bool:
    return isinstance(action, OpenTopic | OpenSubject)


def _changes_plan(action: Action) -> bool:
    return not (_is_open(action) or isinstance(action, SetDetails))


def admit(actions: list[Action], result: Outcome) -> dict:
    """Puts the call's actions among the turn's and returns what the model
    reads."""
    if not result.actions:
        return result.told
    staged = list(actions)
    for action in result.actions:
        if _is_open(action):
            staged = [a for a in staged if not _is_open(a)]
        elif action in staged:
            return ALREADY
        elif _changes_plan(action) and any(_changes_plan(a) for a in staged):
            return refusal(ONE_CHANGE)
        staged.append(action)
    actions[:] = staged
    return result.told

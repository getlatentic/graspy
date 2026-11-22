"""What a tool call adds to the turn's actions for the app, and what the model
is told of it. A tool call is told the truth about what will happen: a change
the app cannot make beside an earlier one is refused or merged here, and the
call says what was not done, so the tutor never tells the learner of more than
reaches them."""

from __future__ import annotations

from .courses import listed, shown_told
from .refusal import refusal
from .reply import (
    MAX_PATH_GOALS,
    Action,
    ChangeSubjects,
    OpenSubject,
    OpenTopic,
    Outcome,
    ProposePath,
    RebuildPlan,
)
from .subject_match import normalise

CONFIRM_FIRST = (
    "Not done: the learner has to confirm another change below first. Tell them "
    "to confirm it, and to ask for this again afterwards."
)
WITHDRAWN = (
    "The courses offered earlier in this turn are withdrawn, since the learner "
    "has to confirm this first: tell them to ask for the courses again afterwards."
)


def asks_to_confirm(action: Action) -> bool:
    """A change that clears progress waits for the learner."""
    return isinstance(action, RebuildPlan) or (
        isinstance(action, ChangeSubjects) and bool(action.remove)
    )


def admit(actions: list[Action], result: Outcome) -> dict:
    """Puts the call's actions among the turn's and returns what the model reads."""
    if any(isinstance(action, ProposePath) for action in result.actions):
        return _admit_courses(actions, result)
    told = dict(result.told)
    notes: list[str] = []
    for action in result.actions:
        if isinstance(action, ChangeSubjects):
            notes += _merge_change(actions, action)
            current = next((a for a in actions if isinstance(a, ChangeSubjects)), None)
            confirming = current is not None and asks_to_confirm(current)
        else:
            if isinstance(action, OpenTopic | OpenSubject):
                actions[:] = [
                    a for a in actions if not isinstance(a, OpenTopic | OpenSubject)
                ]
            actions.append(action)
            confirming = asks_to_confirm(action)
        if confirming and _withdraw_courses(actions):
            notes.append(WITHDRAWN)
    return {**told, "note": " ".join(notes)} if notes else told


def _merge_change(actions: list[Action], new: ChangeSubjects) -> list[str]:
    """Changes of subjects in one turn are one change: what each call was told
    is true, and a subject added and dropped in the turn is left as it was."""
    earlier = next((a for a in actions if isinstance(a, ChangeSubjects)), None)
    add = list(earlier.add) if earlier else []
    remove = list(earlier.remove) if earlier else []
    notes = []
    for name in new.remove:
        key = normalise(name)
        if any(normalise(a) == key for a in add):
            add = [a for a in add if normalise(a) != key]
            notes.append(
                f"{name} was to be added in this turn, so nothing is done for it."
            )
        elif all(normalise(r) != key for r in remove):
            remove.append(name)
    for name in new.add:
        key = normalise(name)
        if any(normalise(r) == key for r in remove):
            remove = [r for r in remove if normalise(r) != key]
            notes.append(
                f"{name} was to be removed in this turn, so it stays and nothing is removed."
            )
        elif all(normalise(a) != key for a in add):
            add.append(name)
    actions[:] = [a for a in actions if not isinstance(a, ChangeSubjects)]
    if add or remove:
        actions.append(ChangeSubjects(add=add, remove=remove))
    return notes


def _withdraw_courses(actions: list[Action]) -> bool:
    kept = [a for a in actions if not isinstance(a, ProposePath)]
    withdrawn = len(kept) != len(actions)
    actions[:] = kept
    return withdrawn


def _admit_courses(actions: list[Action], result: Outcome) -> dict:
    if any(asks_to_confirm(action) for action in actions):
        return refusal(CONFIRM_FIRST)
    offered = {normalise(a.goal) for a in actions if isinstance(a, ProposePath)}
    new: list[ProposePath] = []
    over: list[str] = []
    for action in result.actions:
        if not isinstance(action, ProposePath) or normalise(action.goal) in offered:
            continue
        if len(offered) >= MAX_PATH_GOALS:
            over.append(action.goal)
            continue
        offered.add(normalise(action.goal))
        new.append(action)
    if not new and not over:
        return {
            "note": "These courses are already offered to the learner in this turn."
        }
    if not new:
        return refusal(_over(over))
    actions.extend(new)
    told = dict(result.told)
    if len(new) != len(result.actions):
        told["shown"] = shown_told([a.goal for a in new])
    if over:
        told["not_offered"] = _over(over)
    return told


def _over(goals: list[str]) -> str:
    return (
        f"Not offered, since a turn offers at most {MAX_PATH_GOALS} courses: "
        f"{listed(goals)}. Tell the learner to ask for them next."
    )

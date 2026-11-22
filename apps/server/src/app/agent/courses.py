"""The tutor's tool for new courses: each course a learner asks for is a
subject of its own, proposed to them to add."""

from __future__ import annotations

import json
from collections.abc import Callable

from .context import LearnerContext
from .refusal import refusal
from .reply import MAX_PATH_GOALS, Outcome, ProposePath
from .subject_match import candidates, normalise

MAX_GOAL = 80


def propose_path_tool(context: LearnerContext) -> Callable[..., dict | Outcome]:
    def propose_path(goals: list[str] | str = "", goal: str = "") -> dict | Outcome:
        """Offer the learner a new course: a subject of its own, planned from their grade up
        to the goal. Use it for any course they ask for that is not one of their subjects,
        whether it is far beyond their grade ("real analysis") or a field of its own
        ("quantum computing"), and also while a subject is open: a new course is never a
        topic of the open subject. Several courses are several goals in one call, one goal
        per course. The learner decides whether to add each.

        Args:
            goals: One entry per course, in the learner's words, e.g. ["machine learning", "quantum computing"].
        """
        wanted = distinct_goals(_goal_list(goals or goal))
        if not wanted:
            return refusal("Say what the learner wants to learn.")
        if len(wanted) > MAX_PATH_GOALS:
            return refusal(
                f"At most {MAX_PATH_GOALS} courses at a time: call it again for the rest later."
            )
        names = [s.name for s in context.subjects]
        held = [item for item in wanted if candidates(item, names)]
        new = [item for item in wanted if item not in held]
        if not new:
            return refusal(
                f"The learner already has {listed(held)}: use open_subject to offer it.",
                subjects=names,
            )
        return Outcome(
            told={"shown": shown_told(new), **_already(held)},
            actions=tuple(ProposePath(goal=item) for item in new),
        )

    return propose_path


def _already(held: list[str]) -> dict:
    if not held:
        return {}
    return {
        "not_proposed": f"The learner already has {listed(held)}: offer it with open_subject."
    }


def _goal_list(goals: list[str] | str) -> list[str]:
    """A model may send one course as a string, or the list as JSON text."""
    if not isinstance(goals, str):
        return [item for item in goals if isinstance(item, str)]
    text = goals.strip()
    if text.startswith("["):
        try:
            parsed = json.loads(text)
        except ValueError:
            return [text]
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, str)]
    return [text]


def distinct_goals(goals: list[str]) -> list[str]:
    """Each course once whatever its case, spacing or accents, as first written."""
    first_of: dict[str, str] = {}
    for goal in goals:
        title = " ".join(goal.split())[:MAX_GOAL]
        key = normalise(title)
        if key:
            first_of.setdefault(key, title)
    return list(first_of.values())


def listed(goals: list[str]) -> str:
    return goals[0] if len(goals) == 1 else ", ".join(goals[:-1]) + f" and {goals[-1]}"


def shown_told(goals: list[str]) -> str:
    if len(goals) == 1:
        return (
            f"The app now shows the learner a path to {goals[0]} with a button to add it. "
            "Tell them it is below; do not offer to show it."
        )
    return (
        "The app is offering the learner these courses to add, each its own subject: "
        f"{listed(goals)}. Tell them they are below; do not offer to show them."
    )

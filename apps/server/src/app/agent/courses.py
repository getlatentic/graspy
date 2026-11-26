"""The tutor's tool for new courses: each course a learner asks for is a subject of its own, planned
here and shown to them as a card to choose topics of."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable

from ..domains.path.service import Revision
from .cards import PATH_DESCRIPTION
from .context import LearnerContext
from .path_card import clean_changes, path_card, plan_courses
from .refusal import refusal
from .reply import MAX_PATH_GOALS, Outcome
from .subject_match import candidates, normalise
from .title import MAX_GOAL
from .tools import subject_room
from .workshop import Workshop

FULL = (
    "The learner's plan is full, so no course can be offered: they have to drop "
    "a subject first"
)
NOT_HERE = "Courses cannot be planned in this conversation."
BUSY = (
    "The app is busy planning for others, so nothing was planned. Tell the learner to ask "
    "again in a minute"
)


def propose_path_tool(
    context: LearnerContext, workshop: Workshop | None, earlier_path: str = ""
) -> Callable[..., Awaitable[dict | Outcome]]:
    async def propose_path(
        goals: list[str] | str = "", goal: str = "", changes: str = ""
    ) -> dict | Outcome:
        """Offer the learner a new course: a subject of its own, planned from their grade up
        to the goal, shown as a card where they choose which of its topics to add. Use it for
        any course they ask for that is not one of their subjects, whether it is far beyond
        their grade ("real analysis") or a field of its own ("quantum computing"), and also
        while a subject is open: a new course is never a topic of the open subject. Several
        courses are several goals in one call, one goal per course. A string with commas in it
        is one course, so send a list for several. Nothing is added until they choose.

        When they say a topic is missing or wrong in the path you showed, call it again with
        the same goals and what they said in `changes`: the card is replaced by the new one.

        Args:
            goals: One entry per course, in the learner's words, e.g. ["machine learning", "quantum computing"].
            changes: Only when changing the path you showed: what the learner said is missing or wrong, in their words.
        """
        wanted = _asked(goals or goal)
        if isinstance(wanted, dict):
            return wanted
        names = [s.name for s in context.held_subjects()]
        held = [item for item in wanted if candidates(item, names)]
        new = [item for item in wanted if item not in held]
        if not new:
            return refusal(
                f"The learner already has {listed(held)}: use open_subject to offer it.",
                subjects=names,
            )
        room = subject_room(context)
        if room <= 0:
            return refusal(FULL)
        if workshop is None:
            return refusal(NOT_HERE)
        offered, left_out = new[:room], new[room:]
        revision = _revision(changes, earlier_path)
        planned = await plan_courses(workshop, context, offered, revision)
        if not planned.paths:
            return _unplanned(planned.failed)
        return Outcome(
            told={
                "done": shown_told([p.subject for p in planned.paths]),
                **_already(held),
                **_left_out(left_out, room),
                **_no_room_on_card(planned.left_out),
                **_failed(planned.failed),
            },
            card=path_card(planned.paths, offered),
        )

    return propose_path


def _asked(asked: object) -> list[str] | dict:
    """The courses the model asked for, each once and at most a turn's worth, or the refusal."""
    if not isinstance(asked, str | list):
        return refusal("The courses are a list of names, one string for each.")
    wanted = distinct_goals(_goal_list(asked))
    if not wanted:
        return refusal("Say what the learner wants to learn.")
    if len(wanted) > MAX_PATH_GOALS:
        return refusal(
            f"At most {MAX_PATH_GOALS} courses at a time: call it again for the rest later."
        )
    return wanted


def _revision(changes: str, earlier_path: str) -> Revision | None:
    said = clean_changes(changes)
    return Revision(earlier_path, said) if said and earlier_path else None


def _unplanned(failed: list[str]) -> dict:
    if len(failed) == 1:
        return refusal(
            f"The path to {failed[0]} could not be planned just now. Tell the learner so "
            "plainly and offer to try again, and never say it is below"
        )
    return refusal(BUSY)


def _failed(failed: list[str]) -> dict:
    if not failed:
        return {}
    return {
        "not_planned": f"These could not be planned just now: {listed(failed)}. Tell the learner "
        "plainly and offer to try again."
    }


def _left_out(goals: list[str], room: int) -> dict:
    if not goals:
        return {}
    return {
        "not_offered": f"Not offered, since their plan has room for {room} more: "
        f"{listed(goals)}. Tell the learner to ask for them next."
    }


def _no_room_on_card(goals: list[str]) -> dict:
    if not goals:
        return {}
    return {
        "not_offered_yet": f"Planned, but the card holds no more: {listed(goals)}. "
        "Tell the learner to ask for them next."
    }


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
            parsed = None
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, str)]
        text = text.strip("[]").strip()
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


def shown_told(subjects: list[str]) -> str:
    what = (
        f"a path to {subjects[0]}"
        if len(subjects) == 1
        else f"these courses, each its own subject: {listed(subjects)}"
    )
    return (
        f"The app now shows the learner {what} as a card below your answer, where they choose "
        "which topics to add and can say what is missing. Write only a short lead-in, never "
        "the topics, and wait for their answer. Nothing is added yet."
    )


def earlier_path_in(cards: list[str]) -> str:
    """The latest path card among the cards the conversation held, as it was described to the
    tutor, for a path to be revised from."""
    return next((c for c in reversed(cards) if c.startswith(PATH_DESCRIPTION)), "")

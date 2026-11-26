"""Making the lesson on a topic the learner has just added, so that it is made before they are
told it is ready, and the card that opens it."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import quote

from pydantic import ValidationError

from ..lessons.making import LessonTarget
from ..lessons.tools import LessonAsk, give_lesson, lesson_progress
from .cards import (
    ASKING,
    Card,
    ResultMeta,
    StartCard,
    StartLesson,
    StartResult,
    TextContent,
)
from .context import LearnerContext
from .refusal import refusal
from .reply import AddedPath, AddPaths, Outcome
from .subject_match import candidates
from .tools import find_topic
from .workshop import Workshop

logger = logging.getLogger(__name__)

# A lesson measured at most 34 s on staging. The turn's own limit is 120 s and the tutor still has
# to write its answer, so the wait ends well inside it: a lesson still being made then is shown as
# one, and its card goes on watching it.
WAIT_SECONDS = 75
TICK_SECONDS = 2.5

# What encodeURIComponent leaves as it is, besides letters and digits.
URI_COMPONENT_SAFE = "-_.!~*'()"

Pause = Callable[[float], Awaitable[object]]

TOLD = {
    "ready": (
        "The lesson on {topic} is made. The app shows the learner a button to open it, as a card "
        "below your answer. Write one short line that it is ready there, and that they open it "
        "when they choose."
    ),
    "making": (
        "The lesson on {topic} is still being made. The card below your answer shows its button "
        "when it is done. Tell them it is not ready yet, and never that it is."
    ),
    "failed": (
        "The lesson on {topic} could not be made. Tell the learner so plainly; the card below "
        "your answer has a button to try again. Never say it is ready."
    ),
}
# The reply to a learner whose lesson could not be started at all, in place of words that may say
# it is ready.
NOT_MADE = (
    "I added it to your plan. I could not make the lesson just now, so open it from there "
    "when you are ready."
)
BUSY = (
    "The app is busy making lessons for others, so none was made. Tell the learner to ask "
    "again in a minute"
)


def lesson_path(subject_slug: str, topic_index: int) -> str:
    """Where the app shows a lesson: the web's lessonPath, which escapes as encodeURIComponent does."""
    return f"/app/learn/{quote(subject_slug, safe=URI_COMPONENT_SAFE)}/lesson/{topic_index}"


def target_for(
    context: LearnerContext, path: AddedPath, index: int
) -> LessonTarget | None:
    """The lesson target the app makes for this topic of the course once it is in the plan, field
    for field: the lesson made for it is found again by the learner's record or its key. None
    when the learner's plan is not known well enough to name it."""
    steps = path.steps
    try:
        return LessonTarget(
            plan_id=context.plan_id or "",
            subject_slug=path.slug,
            subject=path.subject,
            topic_index=index,
            topic=steps[index].title,
            total_topics=len(steps),
            country=context.country or "",
            language=context.language or "",
            grade_level=steps[index].level or context.grade_level,
            # The course ends with its goal, whose lesson recaps the steps before it.
            builds_on=[s.title for s in steps[:index]]
            if index == len(steps) - 1
            else [],
        )
    except ValidationError:
        logger.warning("The lesson on %r could not be named", steps[index].title)
        return None


async def _made(target: LessonTarget, workshop: Workshop, pause: Pause) -> dict:
    """The lesson's state once it is made, failed, or the wait is over."""
    ask = LessonAsk(target=target)
    try:
        state = (await give_lesson(ask, workshop.caller))["structuredContent"]
        for _ in range(int(WAIT_SECONDS / TICK_SECONDS)):
            if state["status"] != "making":
                break
            await pause(TICK_SECONDS)
            state = (await lesson_progress(ask, workshop.caller))["structuredContent"]
    except Exception:
        logger.exception("Making the lesson on %s failed", target.topic)
        return {"status": "failed"}
    return state


def start_card(target: LessonTarget, state: dict) -> StartCard:
    content = StartLesson(
        topic=target.topic,
        subject=target.subject,
        status=state["status"],
        target=target,
        lesson_id=state.get("lessonId"),
        open_path=lesson_path(target.subject_slug, target.topic_index),
    )
    return StartCard(
        tool_input={"topic": target.topic, "subject": target.subject},
        tool_result=StartResult(
            content=[TextContent(text=content.describe())],
            structured_content=content,
            meta=ResultMeta(view_uuid=uuid.uuid4().hex),
        ),
    )


async def make_start(
    context: LearnerContext,
    path: AddedPath,
    index: int,
    workshop: Workshop | None,
    pause: Pause = asyncio.sleep,
) -> dict | Outcome:
    """The lesson on a topic of an added course, made, and the card that opens it."""
    target = target_for(context, path, index)
    if target is None or workshop is None:
        return refusal(
            "That lesson cannot be made here. Tell the learner it is in their plan to open"
        )
    if not await workshop.budget.spend():
        return refusal(BUSY)
    state = await _made(target, workshop, pause)
    return Outcome(
        told={"done": TOLD[state["status"]].format(topic=target.topic)},
        card=start_card(target, state),
    )


@dataclass(frozen=True)
class Chosen:
    path: AddedPath
    index: int


def chosen_topic(added: AddPaths | None, topic: str, subject: str) -> Chosen | dict:
    """The topic among the courses the learner just added that the tutor named, or the refusal that
    says which there are."""
    if added is None:
        return refusal(
            "No topic was added in this message, so there is no lesson to start here"
        )
    paths = [
        p
        for p in added.paths
        if not subject.strip() or candidates(subject, [p.subject])
    ]
    found = [
        Chosen(p, i)
        for p in paths
        if (i := find_topic(topic, [s.title for s in p.steps])) is not None
    ]
    if len(found) == 1:
        return found[0]
    topics = {p.subject: [s.title for s in p.steps] for p in added.paths}
    reason = "More than one course has a topic like that" if found else "No such topic"
    return refusal(f"{reason}: {topic!r}.", topics=topics)


def start_lesson_tool(
    context: LearnerContext,
    added: AddPaths | None,
    workshop: Workshop | None,
    pause: Pause = asyncio.sleep,
) -> Callable[..., Awaitable[dict | Outcome]]:
    async def start_lesson(topic: str, subject: str = "") -> dict | Outcome:
        """Make the lesson on one of the topics the learner has just added to their plan, so it
        is ready, and show a button to open it. It takes a little while; the learner sees that
        you are working, and the button appears only when the lesson is made. Call it once, for
        the topic you said you would start with: the one they named, or else the first.

        Args:
            topic: The topic's title, as it was on the path card.
            subject: Which course it is in, only when more than one has a topic by that name.
        """
        picked = chosen_topic(added, topic, subject)
        if isinstance(picked, dict):
            return picked
        return await make_start(context, picked.path, picked.index, workshop, pause)

    return start_lesson


def lacks_start(added: AddPaths, cards: list[Card]) -> bool:
    """Whether a turn that added courses ends with nothing to open and no question for the learner:
    the lesson is owed, whatever the model did."""
    return not any(isinstance(card, (StartCard, *ASKING)) for card in cards)


async def owed_start(
    context: LearnerContext,
    added: AddPaths,
    workshop: Workshop | None,
    pause: Pause = asyncio.sleep,
) -> Card | None:
    """The card for the first topic of the first course added, made as the tool makes it; None when
    it could not be started at all."""
    made = await make_start(context, added.paths[0], 0, workshop, pause)
    return made.card if isinstance(made, Outcome) else None

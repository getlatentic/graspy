"""Planning the courses a learner asked for, and the card that lets them choose topics of each."""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass

from ..domains.path.service import MAX_STEPS, Revision
from .cards import (
    PathCard,
    PathChoice,
    PathResult,
    PathStep,
    PlannedPath,
    ResultMeta,
    TextContent,
)
from .context import LearnerContext
from .path_answer import fit_to_answer
from .subject_match import normalise
from .title import MAX_GOAL, MAX_LEVEL, MAX_TITLE, clean_title
from .workshop import Workshop

logger = logging.getLogger(__name__)

# What a learner says is missing or wrong in a path: a sentence or two.
MAX_CHANGES = 300
# A path is one model call, and the longest a learner waits for all of them together.
PLAN_SECONDS = 45


@dataclass(frozen=True)
class Planned:
    paths: list[PlannedPath]
    # The goals that could not be planned, or could not be afforded in the minute.
    failed: list[str]
    # The goals planned that the card has no room for: the learner's answer must fit a message.
    left_out: list[str]


def planned_path(raw: dict, goal: str) -> PlannedPath | None:
    """The planner's path as the card shows it: titles and levels cut and cleaned, each topic
    once, none blank. None when no topic is left."""
    steps: list[PathStep] = []
    seen: set[str] = set()
    for step in raw.get("steps", [])[:MAX_STEPS]:
        title = clean_title(step.get("title"), MAX_TITLE)
        if title and title.casefold() not in seen:
            seen.add(title.casefold())
            steps.append(
                PathStep(title=title, level=clean_title(step.get("level"), MAX_LEVEL))
            )
    subject = clean_title(raw.get("subject"), MAX_GOAL) or goal
    return PlannedPath(subject=subject, goal=goal, steps=steps) if steps else None


def clean_changes(text: object) -> str:
    return clean_title(text, MAX_CHANGES)


def course_block(earlier: str, goal: str) -> str:
    """The part of the path card last shown that is this goal's course: the only course there, else
    the one whose name and the goal contain one another; none when it cannot be told."""
    blocks: list[tuple[str, list[str]]] = []
    for line in earlier.splitlines()[1:]:
        if line.endswith(":") and not line[:1].isdigit():
            blocks.append((line[:-1], [line]))
        elif blocks:
            blocks[-1][1].append(line)
    if len(blocks) == 1:
        return "\n".join(blocks[0][1])
    wanted = normalise(goal)
    for subject, lines in blocks:
        name = normalise(subject)
        if wanted and name and (wanted in name or name in wanted):
            return "\n".join(lines)
    return ""


async def _plan_one(
    workshop: Workshop,
    context: LearnerContext,
    goal: str,
    revision: Revision | None,
) -> PlannedPath | None:
    # Each course is revised from its own part of the card shown, never the whole of it.
    if revision is not None:
        block = course_block(revision.current, goal)
        revision = Revision(block, revision.changes) if block else None
    try:
        raw = await asyncio.wait_for(
            workshop.planner.plan_path(
                context.country or "",
                context.language or "English",
                context.grade_level or "",
                goal,
                revision,
            ),
            PLAN_SECONDS,
        )
        return planned_path(raw, goal)
    except Exception:
        logger.exception("Planning a path failed")
        return None


async def plan_courses(
    workshop: Workshop,
    context: LearnerContext,
    goals: list[str],
    revision: Revision | None,
) -> Planned:
    """Every goal planned at once, each spending the generation budget first."""
    affordable: list[str] = []
    for goal in goals:
        if not await workshop.budget.spend():
            break
        affordable.append(goal)
    results = await asyncio.gather(
        *(_plan_one(workshop, context, goal, revision) for goal in affordable)
    )
    planned = [path for path in results if path is not None]
    failed = [g for g, path in zip(affordable, results) if path is None]
    shown = fit_to_answer(planned)
    return Planned(
        shown,
        [*failed, *goals[len(affordable) :]],
        [path.goal for path in planned[len(shown) :]],
    )


def path_card(paths: list[PlannedPath], goals: list[str]) -> PathCard:
    choice = PathChoice(paths=paths)
    return PathCard(
        tool_input={"goals": goals},
        tool_result=PathResult(
            content=[TextContent(text=choice.describe())],
            structured_content=choice,
            meta=ResultMeta(view_uuid=uuid.uuid4().hex),
        ),
    )

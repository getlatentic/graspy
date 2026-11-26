"""What the learner chose on a path card, read back from the message the card sends, and what the
tutor is told of it. The card writes the courses and the topics the learner kept, one to a line:

    Add to my plan:
    Course: Real analysis
    - Limits | Grade 12
    - Sequences | Undergraduate

Nothing is saved before this message: the app adds what it names to the learner's own plan."""

from __future__ import annotations

import re

from ..utils.slug import slugify
from .cards import PATH_DESCRIPTION, PathStep, PlannedPath
from .context import LearnerContext
from .reply import MAX_PATH_GOALS, AddedPath, AddPaths
from .subject_match import candidates
from .title import MAX_GOAL, MAX_LEVEL, MAX_TITLE, SEPARATOR, clean_title
from .tools import subject_room

HEAD = "Add to my plan:"
COURSE = "Course: "
STEP = "- "
MAX_STEPS = 12
# The most characters the answer for a card may have. A message holds 2000 (turns/job.py
# MAX_MESSAGE_CHARS), and a card is made so that the answer for all of it fits.
ANSWER_CHARS = 1900

ADDED_TOLD = (
    "The learner chose these topics on the path card, and the app is adding them to their plan "
    "now: {chosen}. Thank them in a few words. Say which topic you will start with, their own "
    "pick if they named one and otherwise the first, and call start_lesson for it straight away: "
    "it makes the lesson, which takes a little while, and a button to open it appears below "
    "only when it is done. Never say it is ready before it returns, and never send them to it: "
    "they open it when they choose."
)


def _step(line: str) -> PathStep | None:
    title, _, level = line.removeprefix(STEP).partition(SEPARATOR)
    title = clean_title(title, MAX_TITLE)
    return PathStep(title=title, level=clean_title(level, MAX_LEVEL)) if title else None


def _read(lines: list[str]) -> list[tuple[str, list[PathStep]]] | None:
    """The courses and their topics, or None when a line is not part of a card's answer."""
    courses: list[tuple[str, list[PathStep]]] = []
    for line in lines:
        if line.startswith(COURSE):
            courses.append((clean_title(line.removeprefix(COURSE), MAX_GOAL), []))
        elif line.startswith(STEP) and courses:
            step = _step(line)
            steps = courses[-1][1]
            if step and len(steps) < MAX_STEPS:
                steps.append(step)
        else:
            return None
    return courses


def _distinct(steps: list[PathStep]) -> list[PathStep]:
    seen: set[str] = set()
    kept = []
    for step in steps:
        if step.title.casefold() not in seen:
            seen.add(step.title.casefold())
            kept.append(step)
    return kept


def _slug(name: str, taken: set[str]) -> str:
    """The slug the app gives a new subject of this name: the name's own, then numbered."""
    base = slugify(name)
    slug, number = base, 2
    while slug in taken:
        slug, number = f"{base}-{number}", number + 1
    taken.add(slug)
    return slug


def path_answer(message: str, context: LearnerContext) -> AddPaths | None:
    """The courses a message from the path card adds, each with the topics the learner kept. A
    course the learner has, one with no topic, and what the plan has no room for are left out; None
    when the message is not a card's answer or nothing is left to add."""
    lines = [line.strip() for line in message.strip().splitlines()]
    if not lines or lines[0] != HEAD:
        return None
    courses = _read(lines[1:])
    if not courses:
        return None
    names = [subject.name for subject in context.held_subjects()]
    taken = {subject.slug for subject in context.held_subjects()}
    room = min(MAX_PATH_GOALS, max(0, subject_room(context)))
    added: list[AddedPath] = []
    for name, steps in courses:
        steps = _distinct(steps)
        if len(added) == room:
            break
        if not (name and steps) or candidates(name, names):
            continue
        names.append(name)
        added.append(
            AddedPath(subject=name, goal=name, steps=steps, slug=_slug(name, taken))
        )
    return AddPaths(paths=added) if added else None


def answer_size(paths: list[PlannedPath]) -> int:
    """The characters of the answer for every topic of these courses, as the card writes it."""
    steps = (len(step.title) + len(step.level) for path in paths for step in path.steps)
    topics = sum(size + len(f"\n{STEP} {SEPARATOR} ") for size in steps)
    courses = sum(len(f"\n{COURSE}{path.subject}") for path in paths)
    return len(HEAD) + courses + topics


def fit_to_answer(paths: list[PlannedPath]) -> list[PlannedPath]:
    """The courses, from the first, whose answer fits a message, and at least the first: a single
    course always fits."""
    for count in range(len(paths), 1, -1):
        if answer_size(paths[:count]) <= ANSWER_CHARS:
            return paths[:count]
    return paths[:1]


SHOWN_STEP = re.compile(r"^\d+\. (?P<title>.+) \([^()]*\)$")


def _shown_topics(cards: list[str]) -> dict[str, set[str]]:
    """The topics of each course the path cards among these cards showed, as they were described
    to the tutor (cards.py's PathChoice.describe), by course."""
    shown: dict[str, set[str]] = {}
    for card in cards:
        if not card.startswith(PATH_DESCRIPTION):
            continue
        course = ""
        for line in card.splitlines()[1:]:
            step = SHOWN_STEP.match(line)
            if step and course:
                shown[course].add(step["title"].casefold())
            elif line.endswith(":"):
                course = line[:-1].casefold()
                shown.setdefault(course, set())
    return shown


def confirmed(added: AddPaths | None, cards: list[str]) -> AddPaths | None:
    """What of a learner's answer a path card this conversation showed offered: a message that
    only looks like the answer, typed by hand, names nothing shown and adds nothing."""
    if added is None:
        return None
    shown = _shown_topics(cards)
    kept = []
    for path in added.paths:
        offered = shown.get(path.subject.casefold(), set())
        steps = [s for s in path.steps if s.title.casefold() in offered]
        if steps:
            kept.append(path.model_copy(update={"steps": steps}))
    return AddPaths(paths=kept) if kept else None


def describe_added(added: AddPaths) -> str:
    """What the tutor reads of the learner's choice."""
    chosen = "; ".join(
        f"{path.subject} ({', '.join(step.title for step in path.steps)})"
        for path in added.paths
    )
    return ADDED_TOLD.format(chosen=chosen)

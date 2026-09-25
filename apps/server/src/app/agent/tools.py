"""The tutor's tools: exact arithmetic, and acting in the learner's app. A
failure is an ``error`` key whose words let the model correct its next step.
Each tool's docstring is what the model reads of it."""

from __future__ import annotations

import difflib
import logging
from collections.abc import Awaitable, Callable

from .context import LearnerContext, SubjectRef
from .lesson_request import asks_for_lesson
from .reply import (
    AddTopic,
    ChangeSubjects,
    OpenSubject,
    OpenTopic,
    Outcome,
    ProposePath,
    RebuildPlan,
)
from .sandbox import CalculationError, evaluate

logger = logging.getLogger(__name__)

# How alike a learner's wording and a topic title must be to count as that
# topic: close enough for a typo, not for a different topic.
TOPIC_MATCH_CUTOFF = 0.8
MAX_TOPIC_TITLE = 80
# The most subjects a learner can study at once, as in the app's own picker.
MAX_CHOSEN_SUBJECTS = 15


def calculate(expression: str) -> dict:
    """Evaluate an arithmetic expression.

    Args:
        expression: A Python math expression, e.g. "0.15 * 240" or "math.sqrt(144)".
    """
    try:
        return {"result": str(evaluate(expression))}
    except CalculationError as exc:
        logger.debug("calculate rejected %r: %s", expression, exc)
        return {"error": str(exc)}


def find_topic(wanted: str, topics: list[str]) -> int | None:
    folded = [title.casefold() for title in topics]
    target = wanted.strip().casefold()
    if target in folded:
        return folded.index(target)
    containing = [
        index
        for index, title in enumerate(folded)
        if target and (target in title or title in target)
    ]
    if len(containing) == 1:
        return containing[0]
    close = difflib.get_close_matches(target, folded, n=1, cutoff=TOPIC_MATCH_CUTOFF)
    return folded.index(close[0]) if close else None


def _opened(context: LearnerContext, index: int, told: dict) -> Outcome:
    topic = context.topics[index]
    return Outcome(
        told={"topic": topic, **told, "done": _button_told("lesson")},
        action=OpenTopic(
            subject_slug=context.subject_slug or "", topic_index=index, topic=topic
        ),
    )


def open_topic_tool(
    context: LearnerContext, message: str
) -> Callable[[str], Awaitable[dict | Outcome]]:
    async def open_topic(topic: str) -> dict | Outcome:
        """Offer a topic's lesson in the learner's app, as a button they tap. Only when they name
        the lesson itself: take me to it, open it, start or continue the lesson. Asking to learn
        or be taught a topic, even another of theirs, is not asking for its lesson: "teach me",
        "explain", "how does it work" and "what is" are answered in this conversation, with no
        button.

        Args:
            topic: The topic as the learner named it, e.g. "fractions".
        """
        if not context.topics or not context.subject_slug:
            return {
                "error": "No subject is open, so there is no topic list to open from."
            }
        index = find_topic(topic, context.topics)
        if index is None:
            return {
                "error": f"No topic like {topic!r} in {context.subject}.",
                "topics": context.topics,
            }
        if not await asks_for_lesson(message):
            return {
                "error": "The learner asked to learn this, not for its lesson: teach "
                "it here, in this conversation, and offer no lesson."
            }
        return _opened(context, index, {"position": index + 1})

    return open_topic


def _subject_named(name: str, context: LearnerContext) -> SubjectRef | None:
    """The learner's subject called ``name``, or the open one for no name."""
    subjects = list(context.subjects)
    if (
        context.subject
        and context.subject_slug
        and context.subject_slug not in {s.slug for s in subjects}
    ):
        subjects.append(SubjectRef(name=context.subject, slug=context.subject_slug))
    if not name.strip():
        return next((s for s in subjects if s.slug == context.subject_slug), None)
    index = find_topic(name, [s.name for s in subjects])
    return None if index is None else subjects[index]


def add_topic_tool(context: LearnerContext) -> Callable[..., dict | Outcome]:
    def add_topic(topic: str, subject: str = "") -> dict | Outcome:
        """Add a new topic to one of the learner's subjects and open its lesson. Use it
        when the learner wants to learn something that is not in their topic list.

        Args:
            topic: A short title for the new topic in the learner's language, e.g. "Photosynthesis".
            subject: Which of the learner's subjects it belongs to. Leave empty for the open subject.
        """
        title = " ".join(topic.split())[:MAX_TOPIC_TITLE]
        if not title:
            return {"error": "The new topic needs a title."}
        target = _subject_named(subject, context)
        if target is None:
            return {
                "error": "The learner has no such subject. To take up a school subject at their grade, use "
                "change_subjects to add it; for something beyond their grade, use propose_path.",
                "subjects": [s.name for s in context.subjects],
            }
        if target.slug == context.subject_slug and context.topics:
            existing = find_topic(title, context.topics)
            if existing is not None:
                # Wanting to learn a topic is no request for its lesson.
                return {
                    "topic": context.topics[existing],
                    "note": "It is already in their topic list, so nothing was added. "
                    "Teach it here, in this conversation; offer its lesson only if "
                    "they ask for the lesson.",
                }
        return Outcome(
            told={"added": title, "subject": target.name, "done": _added_told(title)},
            action=AddTopic(subject_slug=target.slug, subject=target.name, topic=title),
        )

    return add_topic


def _added_told(title: str) -> str:
    """Told nothing, the model opens the new topic, which reaches the list
    only after this turn, fails, and adds it again."""
    return f"The app is adding {title} to their plan. {_button_told('lesson')} Do not open it yourself."


def _button_told(what: str) -> str:
    """The app never leaves the conversation for the learner; they open the
    lesson or subject when they choose."""
    return f"The app shows the learner a button below to open the {what}; tell them it is there."


def change_subjects_tool(context: LearnerContext) -> Callable[..., dict | Outcome]:
    def change_subjects(
        add: list[str] | None = None, remove: list[str] | None = None
    ) -> dict | Outcome:
        """Add subjects to the learner's plan or remove subjects from it. Use it only
        when the learner asks by name to take up a subject or to stop studying one.
        Switching to a subject is not dropping another: use open_subject for that.
        Call it without asking whether they are sure: removing a subject clears
        its progress, so the app asks the learner to confirm that itself.

        Args:
            add: New subjects to study, named in the learner's language, e.g. ["Physics"].
            remove: Subjects of theirs to drop, as the learner named them.
        """
        names = [s.name for s in context.subjects]
        if not names:
            return {
                "error": "The learner's subjects were not sent, so none can be changed."
            }
        dropped = _subjects_named(remove or [], names)
        if isinstance(dropped, dict):
            return dropped
        added = _new_subjects(add or [], names)
        problem = _change_problem(names, added, dropped)
        if problem:
            return problem
        return Outcome(
            told={"done": _change_told(added, dropped)},
            action=ChangeSubjects(add=added, remove=dropped),
        )

    return change_subjects


def _subjects_named(wanted: list[str], names: list[str]) -> list[str] | dict:
    """Each once, or an error naming the first that is none of theirs."""
    found: list[str] = []
    for name in wanted:
        index = find_topic(name, names)
        if index is None:
            return {
                "error": f"The learner has no subject like {name!r}.",
                "subjects": names,
            }
        found.append(names[index])
    return list(dict.fromkeys(found))


def _new_subjects(wanted: list[str], names: list[str]) -> list[str]:
    titles = dict.fromkeys(" ".join(item.split())[:MAX_TOPIC_TITLE] for item in wanted)
    return [title for title in titles if title and find_topic(title, names) is None]


def _change_problem(
    names: list[str], added: list[str], dropped: list[str]
) -> dict | None:
    if not added and not dropped:
        return {
            "error": "Nothing to change: the new subjects are already in the plan.",
            "subjects": names,
        }
    if len(names) - len(dropped) + len(added) > MAX_CHOSEN_SUBJECTS:
        return {
            "error": f"A plan holds at most {MAX_CHOSEN_SUBJECTS} subjects.",
            "subjects": names,
        }
    if len(names) == len(dropped) and not added:
        return {"error": "A plan needs at least one subject."}
    return None


def _change_told(added: list[str], dropped: list[str]) -> str:
    """The change happens in the app after this turn: nothing added can be
    opened yet, and nothing is dropped until the learner confirms."""
    parts = []
    if added:
        parts.append(
            f"The app is adding {', '.join(added)} to the learner's subjects now; tell them so. "
            "It cannot be opened in this turn."
        )
    if dropped:
        parts.append(
            f"The app is asking the learner to confirm removing {', '.join(dropped)}; "
            "tell them to confirm below."
        )
    return " ".join(parts)


def rebuild_plan_tool(context: LearnerContext) -> Callable[[], dict | Outcome]:
    def rebuild_plan() -> dict | Outcome:
        """Make new topic lists for all of the learner's subjects. Use it only when the
        learner asks to start their plan again or rebuild it. Call it without asking
        whether they are sure: it clears their progress, so the app asks them to
        confirm itself.
        """
        if not context.subjects:
            return {
                "error": "The learner's subjects were not sent, so the plan cannot be rebuilt."
            }
        return Outcome(told={"needs_confirmation": True}, action=RebuildPlan())

    return rebuild_plan


def open_subject_tool(context: LearnerContext) -> Callable[[str], dict | Outcome]:
    def open_subject(subject: str) -> dict | Outcome:
        """Offer one of the learner's subjects in their app, as a button they tap. Use it when
        the learner asks to switch to, go to or open a subject. It changes nothing in
        their plan.

        Args:
            subject: The subject as the learner named it, e.g. "maths".
        """
        target = _subject_named(subject, context) if subject.strip() else None
        if target is None:
            return {
                "error": f"The learner has no subject like {subject!r}. To take up a school subject at "
                "their grade, use change_subjects to add it; for something beyond their grade, use propose_path.",
                "subjects": [s.name for s in context.subjects],
            }
        return Outcome(
            told={"subject": target.name, "done": _button_told("subject")},
            action=OpenSubject(subject_slug=target.slug, subject=target.name),
        )

    return open_subject


def propose_path(goal: str) -> dict | Outcome:
    """Offer the learner a path to something bigger than one topic or beyond their
    grade, such as a whole subject they do not have ("teach me real analysis").
    The app plans the steps from their grade to the goal and shows them, and the
    learner decides whether to add the path.

    Args:
        goal: What the learner wants to learn, in their words, e.g. "real analysis".
    """
    wanted = " ".join(goal.split())[:MAX_TOPIC_TITLE]
    if not wanted:
        return {"error": "Say what the learner wants to learn."}
    return Outcome(
        told={
            "shown": f"The app now shows the learner a path to {wanted} with a button to add it. "
            "Tell them it is below; do not offer to show it."
        },
        action=ProposePath(goal=wanted),
    )

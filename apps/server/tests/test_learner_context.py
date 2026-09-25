"""What the tutor is told about where the learner is: from their app, and
the lesson on the topic from the server's own keeping."""

import json

from lesson_example import LESSON as KEPT
from lesson_example import wire

from app.agent.context import (
    MAX_KEY_POINTS,
    MAX_POINT,
    MAX_SLIDES,
    LearnerContext,
    with_kept_lesson,
)
from app.learner.record import LearnerRecord, TopicMark
from app.lessons.store import DurableObjectLessonStore

FRACTIONS = {
    "subject": "Mathematics",
    "subjectSlug": "mathematics",
    "topic": "Fractions",
    "topics": ["Number and Place Value", "Fractions"],
}
LESSON = {
    "title": "Fractions",
    "keyPoints": [
        "A fraction names equal parts of a whole.",
        "The bottom number counts the parts.",
    ],
    "slides": ["Parts of a whole", "Equivalent fractions"],
}


def context(**learner) -> LearnerContext:
    """A context as the server fills it: the lesson is its own to add."""
    return LearnerContext.model_validate(learner)


def test_a_lesson_the_app_sends_is_dropped():
    sent = LearnerContext.from_metadata({"learner": {**FRACTIONS, "lesson": LESSON}})

    assert sent.lesson is None
    assert sent.topic == "Fractions"


def test_the_lesson_the_learner_has_is_described_under_its_topic():
    studying = context(**FRACTIONS, lesson=LESSON).describe_studying()

    assert "This conversation is about: Fractions" in studying
    assert "The learner has this topic's lesson, 'Fractions':" in studying
    assert "1. Parts of a whole\n2. Equivalent fractions" in studying
    assert "- The bottom number counts the parts." in studying


def test_a_lesson_without_a_topic_describes_nothing():
    """A lesson belongs to one topic; a whole subject's conversation has none."""
    studying = context(
        subject="Mathematics", subjectSlug="mathematics", lesson=LESSON
    ).describe_studying()

    assert "lesson" not in studying


def test_a_long_lesson_is_cut_to_size_and_keeps_the_rest_of_the_context():
    """Lesson text is the model's, of any length: refusing it would drop the
    learner's whole context with it."""
    long = {
        "title": "F" * 500,
        "keyPoints": ["x" * 1000] * (MAX_KEY_POINTS + 5),
        "slides": ["Slide"] * (MAX_SLIDES + 5),
    }

    learner = context(**FRACTIONS, lesson=long)

    assert learner.topic == "Fractions"
    assert learner.lesson is not None
    assert len(learner.lesson.title) == 200
    assert len(learner.lesson.key_points) == MAX_KEY_POINTS
    assert {len(point) for point in learner.lesson.key_points} == {MAX_POINT}
    assert len(learner.lesson.slides) == MAX_SLIDES


def test_blank_and_non_text_entries_are_dropped():
    learner = context(
        **FRACTIONS,
        lesson={
            "title": "Fractions",
            "keyPoints": ["  ", 3, "Halves"],
            "slides": [None],
        },
    )

    assert learner.lesson.key_points == ["Halves"]
    assert learner.lesson.slides == []


class KeptLessons:
    """The lessons' Durable Object namespace, holding what earlier builds
    kept as it was kept."""

    def __init__(self, **stored: str):
        self.stored = stored

    def getByName(self, lesson_id: str):
        stored = self.stored

        class Stub:
            async def find(self) -> str:
                return stored.get(lesson_id, "")

        return Stub()


async def with_lesson_kept_as(kept: str) -> LearnerContext:
    record = LearnerRecord(
        topics=[
            TopicMark(
                plan_id="plan-1",
                subject_slug="mathematics",
                topic_index=1,
                topic="Fractions",
                lesson_id="lesson-1",
            )
        ]
    )
    lessons = DurableObjectLessonStore(KeptLessons(**{"lesson-1": kept}))
    return await with_kept_lesson(
        context(**FRACTIONS, planId="plan-1"), record, lessons
    )


async def test_a_lesson_kept_by_an_earlier_build_is_read():
    """Before objectives were kept, and with a part since dropped."""
    earlier = {**wire(KEPT), "session": {"slide": 2}}
    del earlier["objectives"]

    learner = await with_lesson_kept_as(json.dumps(earlier))

    assert learner.lesson.title == "Fractions"
    assert learner.lesson.objectives == []
    assert learner.lesson.key_points == ["k"]
    assert learner.lesson.slides == ["Parts"]


async def test_a_malformed_kept_lesson_is_skipped_and_the_turn_goes_on(caplog):
    learner = await with_lesson_kept_as(json.dumps({"slides": [1]}))

    assert learner.lesson is None
    assert learner.topic == "Fractions"
    assert "Kept lesson lesson-1 is malformed" in caplog.messages

"""A lesson on a topic of a held curriculum is written from the topic's official objectives and textbook passages,
and cites them; any other lesson is asked and shown as it always was."""

import json

import pytest
from lesson_example import wire
from stand_in import inputs, stand_in
from test_lesson_answer_checks import (
    NO_RIGHT_OPTION,
    PLAIN,
    PLAN,
    RIGHT_KEY,
    _practice,
    _written,
)
from test_lesson_service import (
    COUNTRY,
    JSS_1,
    MIN_SLIDES,
    WITHOUT_STAGE,
    _answers,
)

from app.domains.curriculum.packages import held_course
from app.domains.lesson.grounded import NO_PASSAGES
from app.domains.lesson.service import LessonRequest, LessonService
from app.learner.store import InMemoryLearnerStore
from app.lessons.making import Job, LessonTarget
from app.lessons.run import LessonRunner
from app.lessons.store import InMemoryLessonStore

HELD_TOPIC = "Fractions"
CALLS = MIN_SLIDES + 2


def _course():
    course = held_course("NG", "jss-1", "Mathematics")
    assert course is not None
    return course


async def _lesson(subject="Mathematics", topic=HELD_TOPIC, grade=JSS_1):
    lm, context = stand_in(_answers())
    request = LessonRequest(COUNTRY, "English", subject, topic, grade)
    with context:
        events = [event async for event in LessonService().events(request)]
    return lm, events


async def test_the_plan_each_slide_and_the_practice_are_given_the_topics_objectives_and_passages():
    lm, _ = await _lesson()
    topic = _course().topic(HELD_TOPIC)
    objectives = "\n".join(f"- {o.statement}" for o in topic.objectives)

    for call in range(CALLS):
        asked = inputs(lm, call)
        assert asked["curriculum_objectives"] == objectives
        for passage in topic.passages:
            assert passage.title in asked["source_passages"]
            assert passage.text in asked["source_passages"]
    assert topic.objectives and topic.passages


async def test_a_slide_written_again_is_still_given_them():
    lm, context = stand_in(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(NO_RIGHT_OPTION, title="First"),
            _written(RIGHT_KEY, title="Again"),
            _written(PLAIN),
            _written(PLAIN),
            _practice(PLAIN),
        ]
    )
    request = LessonRequest(COUNTRY, "English", "Mathematics", HELD_TOPIC, JSS_1)
    with context:
        _ = [event async for event in LessonService().events(request)]

    again = inputs(lm, 2)
    assert "check_problem" in again
    assert again["curriculum_objectives"] == inputs(lm, 1)["curriculum_objectives"]
    assert again["source_passages"] == inputs(lm, 1)["source_passages"]


@pytest.mark.parametrize(
    ("subject", "topic"),
    [
        ("Basic Science", "Fractions"),
        ("Mathematics", "Algebra"),
    ],
    ids=[
        "a subject no held curriculum teaches",
        "a topic the curriculum does not list",
    ],
)
async def test_a_lesson_a_model_planned_is_asked_word_for_word_as_before(
    subject, topic
):
    lm, events = await _lesson(subject, topic)

    for call in range(CALLS):
        asked = inputs(lm, call)
        assert "curriculum_objectives" not in asked
        assert "source_passages" not in asked
        assert "stage" in asked
    assert "grounding" not in {event["type"] for event in events}
    assert wire(events[-1]["payload"].lesson)["grounding"] is None
    system = lm.history[0]["messages"][0]["content"]
    assert "curriculum_objectives" not in system
    assert WITHOUT_STAGE["GenerateLessonPlan"].split("\n")[0] in system


async def test_a_class_the_catalogue_cannot_place_is_not_grounded():
    lm, _ = await _lesson(grade="JSS 1")

    assert "curriculum_objectives" not in inputs(lm, 0)


async def test_the_lesson_names_the_objectives_and_the_passages_it_was_written_from():
    _, events = await _lesson()
    shown = wire(events[-1]["payload"].lesson)["grounding"]
    topic = _course().topic(HELD_TOPIC)

    assert (shown["authority"], shown["edition"]) == ("NERDC", "September 2025")
    assert [o["code"] for o in shown["objectives"]] == [
        o.code for o in topic.objectives
    ]
    assert [p["id"] for p in shown["passages"]] == [p.id for p in topic.passages]
    assert shown["textbook"]["licence"] == "Creative Commons Attribution 3.0 Unported"
    assert "Siyavula" in shown["textbook"]["attribution"]


async def test_the_citation_is_sent_before_the_plan_so_it_is_shown_while_the_lesson_is_made():
    _, events = await _lesson()
    kinds = [event["type"] for event in events]

    assert kinds.index("grounding") < kinds.index("plan")


async def test_a_topic_with_no_linked_passage_says_so_and_is_written_from_the_objectives_alone(
    monkeypatch,
):
    monkeypatch.setattr("app.domains.curriculum.packages.passages.PASSAGES", {})
    lm, events = await _lesson()
    shown = wire(events[-1]["payload"].lesson)["grounding"]

    for call in range(CALLS):
        assert inputs(lm, call)["source_passages"] == NO_PASSAGES
    assert shown["passages"] == [] and shown["textbook"] is None
    assert shown["objectives"]


async def test_a_lesson_being_made_shows_its_citation_before_its_first_slide():
    lessons = InMemoryLessonStore()
    saved = []

    async def save(making):
        saved.append(making)

    target = LessonTarget(
        plan_id="plan-1",
        subject_slug="mathematics",
        subject="Mathematics",
        topic_index=1,
        topic=HELD_TOPIC,
        total_topics=24,
        country=COUNTRY,
        language="English",
        grade_level=JSS_1,
    )
    lm, context = stand_in(_answers())
    runner = LessonRunner(LessonService(), lessons, InMemoryLearnerStore(), lm)
    with context:
        await runner(Job(target=target), save)

    first_slide = next(m for m in saved if m.lesson and m.lesson.slides)
    assert first_slide.lesson.grounding is not None
    kept = json.loads(saved[-1].model_dump_json(by_alias=True))["lesson"]["grounding"]
    assert kept["authority"] == "NERDC"

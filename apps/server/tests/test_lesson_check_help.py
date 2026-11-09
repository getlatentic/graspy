"""A wrong answer to a lesson's check is met with help, kept as evidence, and a missed check comes back."""

from lesson_example import LESSON, SLIDE
from test_lesson_app import (  # noqa: F401  (server is a fixture)
    DEVICE,
    FRACTIONS,
    TARGET,
    connected,
    http_to,
    record_of,
    server,
)
from test_lesson_review import at

import app.learner.answers as answers_module
from app.learner.answers import PracticeAnswer
from app.learner.record import Answer, Answered, LessonKept

WHERE = {"planId": "plan-1", "subjectSlug": "mathematics", "topic": "Fractions"}
FOUR = {
    "question": "Which is bigger, 1/2 or 1/3?",
    "options": ["1/2", "1/3", "1/4", "1/5"],
    "answerIndex": 0,
    "where": WHERE,
    "slide": 0,
    "key": "view-1:0",
}


def tried(chosen: int, *before: int) -> dict:
    return {**FOUR, "chosenIndex": chosen, "tried": list(before)}


async def test_wrong_answers_are_given_a_little_more_help_each_time(server):  # noqa: F811
    async with connected(server) as client:
        first = await client.call_tool("answer_check", tried(1))
        second = await client.call_tool("answer_check", tried(2, 1))
        third = await client.call_tool("answer_check", tried(3, 1, 2))

    assert first.structured_content["help"] == {"kind": "cue", "keep": []}
    assert second.structured_content["help"] == {"kind": "narrow", "keep": [0, 3]}
    assert third.structured_content["help"] == {"kind": "told", "keep": []}


async def test_a_right_answer_is_given_no_help(server):  # noqa: F811
    async with connected(server) as client:
        right = await client.call_tool("answer_check", tried(0, 1))

    assert right.structured_content == {
        "correct": True,
        "answerIndex": 0,
        "chosenIndex": 0,
    }


async def test_a_practice_card_is_given_no_help(server):  # noqa: F811
    async with connected(server) as client:
        card = await client.call_tool("answer_practice", tried(1))

    assert "help" not in card.structured_content


async def test_each_try_is_kept_once_with_its_number(server):  # noqa: F811
    async with connected(server) as client:
        await client.call_tool("answer_check", tried(1))
        await client.call_tool("answer_check", tried(1))
        await client.call_tool("answer_check", tried(0, 1))

    answers = (await record_of(server))["answers"]
    assert [(a["correct"], a["slide"]) for a in answers] == [(False, 0), (True, 0)]


async def test_a_check_missed_yesterday_is_offered_again_in_its_lesson(server):  # noqa: F811
    keeping = server.state.keeping
    await keeping.lessons.keep("lesson-1", LESSON)
    await keeping.learners.change(
        DEVICE, LessonKept(topic=FRACTIONS, lesson_id="lesson-1")
    )
    missed = Answer(
        plan_id="plan-1",
        subject_slug="mathematics",
        topic="Fractions",
        lesson_id="lesson-1",
        slide=0,
        attempt=1,
        source="lesson",
        question=SLIDE.assessment.prompt,
        correct=False,
        at=at(1) - 86_400_000 * 30,
    )
    await keeping.learners.change(DEVICE, Answered(answer=missed))

    async with connected(server) as client:
        opened = await client.call_tool("give_lesson", {"target": TARGET})
    record = await record_of(server)

    assert opened.structured_content["review"] == [0]
    assert [(m["subjectSlug"], m["topicIndex"]) for m in record["review"]] == [
        ("mathematics", 1)
    ]


async def test_a_lesson_with_nothing_missed_has_nothing_to_review(server):  # noqa: F811
    keeping = server.state.keeping
    await keeping.lessons.keep("lesson-1", LESSON)
    await keeping.learners.change(
        DEVICE, LessonKept(topic=FRACTIONS, lesson_id="lesson-1")
    )

    async with connected(server) as client:
        opened = await client.call_tool("give_lesson", {"target": TARGET})

    assert opened.structured_content["review"] == []
    assert (await record_of(server))["review"] == []


async def test_a_check_answered_for_a_lesson_is_kept_with_that_lesson(server):  # noqa: F811
    keeping = server.state.keeping
    await keeping.lessons.keep("lesson-1", LESSON)
    await keeping.learners.change(
        DEVICE, LessonKept(topic=FRACTIONS, lesson_id="lesson-1")
    )

    async with connected(server) as client:
        await client.call_tool("answer_check", tried(1))

    [answer] = (await record_of(server))["answers"]
    assert answer["lessonId"] == "lesson-1"


async def test_try_numbers_must_name_options(server):  # noqa: F811
    async with connected(server) as client:
        refused = await client.call_tool("answer_check", tried(1, 9))
        right_as_wrong = await client.call_tool("answer_check", tried(1, 0))

    assert refused.is_error
    assert right_as_wrong.is_error


def test_the_first_try_of_a_later_day_does_not_replace_the_first_try_of_an_earlier_one(
    monkeypatch,
):
    asked = PracticeAnswer.model_validate(tried(1))
    keys = []
    for day in (1, 2):
        monkeypatch.setattr(answers_module, "now_ms", lambda day=day: at(day))
        keys.append(asked.kept("lesson").key)

    assert keys[0] != keys[1]
    assert keys[0].startswith("view-1:0:")

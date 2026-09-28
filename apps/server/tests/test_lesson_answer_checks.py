"""Each check's answer marked in code as a lesson is made, before a learner
sees it or it is translated, with what each model call was asked read back."""

import json
import logging

from lesson_example import wire
from stand_in import inputs, stand_in

from app.domains.lesson.answers.verdict import Found
from app.domains.lesson.checked import Outcome
from app.domains.lesson.lesson import Lesson
from app.domains.lesson.service import LessonRequest, LessonService

TWO_FIFTHS = r"Which decimal is equal to \(\frac{2}{5}\)?"
WRONG_KEY = {
    "question": TWO_FIFTHS,
    "options": ["0.2", "0.4", "2.5", "0.25"],
    "answer_index": 0,
    "correct_feedback": "Correct! 2 ÷ 5 = 0.2.",
    "incorrect_feedback": "Divide the top by the bottom.",
}
RIGHT_KEY = {**WRONG_KEY, "answer_index": 1, "correct_feedback": "Yes: 0.4."}
NO_RIGHT_OPTION = {**WRONG_KEY, "options": ["0.2", "0.5", "2.5", "0.25"]}
DOUBLE_RIGHT = {
    "question": "Which fraction is equivalent to 0.6?",
    "options": ["3/5", "6/10", "2/5", "1/6"],
    "answer_index": 0,
    "correct_feedback": "Yes: 0.6 = 3/5.",
    "incorrect_feedback": "Write 0.6 as 6 tenths, then simplify.",
}
UNCHECKED = {
    "question": "Ada has 5 mangoes and gives away 2. How many are left?",
    "options": ["3", "2", "7"],
    "answer_index": 1,
    "correct_feedback": "Correct",
    "incorrect_feedback": "Try again",
}
PLAIN = {
    "question": "What does a fraction show?",
    "options": ["Part of a whole", "A whole number"],
    "answer_index": 0,
    "correct_feedback": "Correct",
    "incorrect_feedback": "Try again",
}
PLAN = {
    "learningObjectives": ["Read a fraction", "Write it as a decimal", "Check it"],
    "keyPoints": ["A fraction is a division."],
    "slideSpecs": [
        {"slideType": "concept_introduction", "title": f"Spec {i}", "keyConcept": "k"}
        for i in range(3)
    ],
}


def _written(check, title="Slide", body="Body"):
    """A slide as the model writes it."""
    return {
        "reasoning": "r",
        "title": title,
        "body_md": body,
        "question": check["question"],
        "options": "\n".join(f"- {option}" for option in check["options"]),
        "answer_index": check["answer_index"],
        "correct_feedback": check["correct_feedback"],
        "incorrect_feedback": check["incorrect_feedback"],
    }


def _practice(check):
    written = _written(check)
    return {key: written[key] for key in written if key not in ("title", "body_md")}


def _translated(written):
    return {
        ("reasoning" if key == "reasoning" else f"translated_{key}"): value
        for key, value in written.items()
        if key != "answer_index"
    }


FAILED = {"reasoning": "r"}


async def _made(answers, language="English"):
    lm, context = stand_in(answers)
    request = LessonRequest("Nigeria", language, "Mathematics", "Fractions", "JSS 1")
    with context:
        events = [event async for event in LessonService().events(request)]
    return lm, json.loads(json.dumps(events, default=wire))


def _lesson(events):
    return events[-1]["payload"]["lesson"]


def _reports(caplog):
    return [
        (
            record.answer_check.where,
            record.answer_check.found,
            record.answer_check.outcome,
        )
        for record in caplog.records
        if hasattr(record, "answer_check")
    ]


async def test_a_wrong_key_is_moved_to_the_right_option_before_the_learner_sees_it(
    caplog,
):
    _, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(WRONG_KEY),
            _written(PLAIN),
            _written(PLAIN),
            _practice(PLAIN),
        ]
    )

    check = _lesson(events)["slides"][0]["assessment"]
    assert check["options"] == ["0.2", "0.4", "2.5", "0.25"]
    assert check["answerIndex"] == 1
    assert check["correctFeedback"] == "That's right: the answer is 0.4."
    assert check["incorrectFeedback"] == "Divide the top by the bottom."
    assert events[-1]["payload"]["success"] is True
    assert _reports(caplog) == [
        ("slide 1 of Mathematics/Fractions", Found.WRONG_KEY, Outcome.REKEYED)
    ]


async def test_a_second_right_option_is_taken_out(caplog):
    _, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(PLAIN),
            _written(DOUBLE_RIGHT),
            _written(PLAIN),
            _practice(PLAIN),
        ]
    )

    check = _lesson(events)["slides"][1]["assessment"]
    assert (check["options"], check["answerIndex"]) == (["3/5", "2/5", "1/6"], 0)
    assert _reports(caplog) == [
        ("slide 2 of Mathematics/Fractions", Found.DOUBLE_RIGHT, Outcome.TRIMMED)
    ]


async def test_a_check_with_no_right_option_is_written_again_told_why(caplog):
    lm, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(NO_RIGHT_OPTION, title="First"),
            _written(RIGHT_KEY, title="Again"),
            _written(PLAIN),
            _written(PLAIN),
            _practice(PLAIN),
        ]
    )

    asked_again = inputs(lm, 2)
    assert asked_again["check_problem"] == (
        f"The check {TWO_FIFTHS!r} has the answer 2/5 (0.4), written as a decimal, "
        "but none of its options ('0.2', '0.5', '2.5', '0.25') is. Write the check "
        "again with the right answer among the options, and answer_index marking it."
    )
    assert json.loads(asked_again["slide_spec"])["title"] == "Spec 0"
    assert lm.history[2]["kwargs"]["temperature"] == 0.7
    assert "check_problem" not in inputs(lm, 1)
    slide = _lesson(events)["slides"][0]
    assert (slide["title"], slide["assessment"]["answerIndex"]) == ("Again", 1)
    assert _reports(caplog) == [
        ("slide 1 of Mathematics/Fractions", Found.NO_RIGHT_OPTION, Outcome.REWRITTEN)
    ]


async def test_a_check_still_wrong_when_written_again_is_taken_out_and_the_slide_kept(
    caplog,
):
    """Taking the check out teaches nothing wrong; keeping it would tell the
    learner a wrong answer is right."""
    lm, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(NO_RIGHT_OPTION, title="First", body="Divide 2 by 5."),
            _written(NO_RIGHT_OPTION, title="Again"),
            _written(PLAIN),
            _written(PLAIN),
            _practice(PLAIN),
        ]
    )

    slide = _lesson(events)["slides"][0]
    assert (slide["title"], slide["bodyMd"], slide["assessment"]) == (
        "First",
        "Divide 2 by 5.",
        None,
    )
    assert events[-1]["payload"]["success"] is True
    assert inputs(lm, 3)["previous_context"] == "Previous slides covered:\n1. First"
    assert _reports(caplog) == [
        ("slide 1 of Mathematics/Fractions", Found.NO_RIGHT_OPTION, Outcome.DROPPED)
    ]


async def test_a_check_not_written_again_is_taken_out(caplog):
    _, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(NO_RIGHT_OPTION),
            FAILED,
            _written(PLAIN),
            _written(PLAIN),
            _practice(PLAIN),
        ]
    )

    assert _lesson(events)["slides"][0]["assessment"] is None
    assert "A check was not written again" in caplog.messages


async def test_right_options_that_would_leave_two_are_written_again_before_trimmed(
    caplog,
):
    """Three right of four would leave a coin toss: the check is written again,
    and trimmed to two only when that fails."""
    three_right = {**DOUBLE_RIGHT, "options": ["1/2", "3/5", "6/10", "9/15"]}
    lm, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(three_right),
            FAILED,
            _written(PLAIN),
            _written(PLAIN),
            _practice(PLAIN),
        ]
    )

    assert (
        "right option: '3/5', '6/10', '9/15' are each 3/5"
        in inputs(lm, 2)["check_problem"]
    )
    check = _lesson(events)["slides"][0]["assessment"]
    assert (check["options"], check["answerIndex"]) == (["1/2", "3/5"], 1)
    assert _reports(caplog)[0][1:] == (Found.DOUBLE_RIGHT, Outcome.TRIMMED)


async def test_a_practice_question_with_a_wrong_key_is_moved():
    _, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(PLAIN),
            _written(PLAIN),
            _written(PLAIN),
            _practice(WRONG_KEY),
        ]
    )

    assert _lesson(events)["practice"]["answerIndex"] == 1
    assert events[-2]["payload"]["answerIndex"] == 1


async def test_a_practice_question_written_again_is_told_why():
    lm, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(PLAIN),
            _written(PLAIN),
            _written(PLAIN),
            _practice(NO_RIGHT_OPTION),
            _practice(RIGHT_KEY),
        ]
    )

    assert "has the answer 2/5 (0.4)" in inputs(lm, 5)["check_problem"]
    assert lm.history[5]["kwargs"]["temperature"] == 0.7
    assert _lesson(events)["practice"]["answerIndex"] == 1


async def test_a_practice_question_still_wrong_is_left_out(caplog):
    _, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(PLAIN),
            _written(PLAIN),
            _written(PLAIN),
            _practice(NO_RIGHT_OPTION),
            _practice(NO_RIGHT_OPTION),
        ]
    )

    assert "practice" not in [event["type"] for event in events]
    assert _lesson(events)["practice"] is None
    assert events[-1]["payload"]["success"] is True
    assert _reports(caplog) == [
        (
            "the practice question of Mathematics/Fractions",
            Found.NO_RIGHT_OPTION,
            Outcome.DROPPED,
        )
    ]


async def test_a_translated_lesson_is_checked_in_english_and_translated_in_order():
    """The key is a position: the translation is asked for the options in the
    checked order, and the repaired key points into its translation."""
    yoruba = {**WRONG_KEY, "question": "Èwo ni ...?", "correct_feedback": "Ó dára!"}
    lm, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            {
                "reasoning": "r",
                "translated_summary": {
                    "learningObjectives": ["a", "b", "c"],
                    "keyPoints": ["k"],
                },
            },
            _written(WRONG_KEY),
            _translated(_written(yoruba)),
            _written(PLAIN),
            _translated(_written(PLAIN)),
            _written(PLAIN),
            _translated(_written(PLAIN)),
            _practice(PLAIN),
            _translated(_practice(PLAIN)),
        ],
        language="Yoruba",
    )

    asked = inputs(lm, 3)
    assert asked["options"] == "- 0.2\n- 0.4\n- 2.5\n- 0.25"
    assert asked["correct_feedback"] == "That's right: the answer is 0.4."
    check = _lesson(events)["slides"][0]["assessment"]
    assert (check["prompt"], check["answerIndex"]) == ("Èwo ni ...?", 1)
    assert check["options"][1] == "0.4"


async def test_a_translation_that_changes_an_options_number_is_not_shown():
    yoruba = {**RIGHT_KEY, "options": ["0.4", "0.2", "2.5", "0.25"]}
    _, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            {
                "reasoning": "r",
                "translated_summary": {
                    "learningObjectives": ["a", "b", "c"],
                    "keyPoints": ["k"],
                },
            },
            _written(PLAIN),
            _translated(_written(PLAIN)),
            _written(PLAIN),
            _translated(_written(PLAIN)),
            _written(PLAIN),
            _translated(_written(PLAIN)),
            _practice(RIGHT_KEY),
            _translated(_practice(yoruba)),
        ],
        language="Yoruba",
    )

    practice = _lesson(events)["practice"]
    assert (practice["options"], practice["answerIndex"]) == (RIGHT_KEY["options"], 1)
    assert events[-1]["payload"]["success"] is False


async def test_a_slide_whose_check_was_taken_out_is_translated_without_one():
    lm, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            {
                "reasoning": "r",
                "translated_summary": {
                    "learningObjectives": ["a", "b", "c"],
                    "keyPoints": ["k"],
                },
            },
            _written(NO_RIGHT_OPTION, title="First"),
            _written(NO_RIGHT_OPTION),
            {
                "reasoning": "r",
                "translated_title": "Àkọ́kọ́",
                "translated_body_md": "Pín",
            },
            _written(PLAIN),
            _translated(_written(PLAIN)),
            _written(PLAIN),
            _translated(_written(PLAIN)),
            _practice(PLAIN),
            _translated(_practice(PLAIN)),
        ],
        language="Yoruba",
    )

    assert inputs(lm, 4) == {
        "target_language": "Yoruba",
        "title": "First",
        "body_md": "Body",
    }
    slide = _lesson(events)["slides"][0]
    assert (slide["title"], slide["bodyMd"], slide["assessment"]) == (
        "Àkọ́kọ́",
        "Pín",
        None,
    )
    assert events[-1]["payload"]["success"] is True


async def test_a_lesson_written_in_another_language_is_not_checked(caplog):
    """The checks read questions in English."""
    _, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(WRONG_KEY),
            _written(PLAIN),
            _written(PLAIN),
            _practice(WRONG_KEY),
        ],
        language="French",
    )

    assert _lesson(events)["slides"][0]["assessment"]["answerIndex"] == 0
    assert _lesson(events)["practice"]["answerIndex"] == 0
    assert _reports(caplog) == []


async def test_a_question_the_checks_cannot_work_out_is_left_as_written(caplog):
    caplog.set_level(logging.DEBUG, logger="app.domains.lesson.checked")
    _, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(UNCHECKED),
            _written(RIGHT_KEY),
            _written(PLAIN),
            _practice(PLAIN),
        ]
    )

    first, second = (slide["assessment"] for slide in _lesson(events)["slides"][:2])
    assert (first["options"], first["answerIndex"]) == (UNCHECKED["options"], 1)
    assert second["correctFeedback"] == "Yes: 0.4."
    assert [found for _, found, _ in _reports(caplog)] == [
        Found.NOT_COMPUTABLE,
        Found.RIGHT,
        Found.NOT_COMPUTABLE,
        Found.NOT_COMPUTABLE,
    ]


async def test_a_right_check_the_checks_cannot_read_is_never_written_again(caplog):
    """ "What decimal is 3 of 4?" was read as 3 × 4, and its key moved to 12."""
    caplog.set_level(logging.DEBUG, logger="app.domains.lesson.checked")
    part_of = {
        **RIGHT_KEY,
        "question": "What decimal is 3 of 4?",
        "options": ["0.75", "12", "0.34", "1.33"],
        "answer_index": 0,
    }
    lm, events = await _made(
        [
            {"reasoning": "r", "plan": PLAN},
            _written(part_of),
            _written(PLAIN),
            _written(PLAIN),
            _practice(PLAIN),
        ]
    )

    check = _lesson(events)["slides"][0]["assessment"]
    assert (check["options"], check["answerIndex"]) == (part_of["options"], 0)
    assert len(lm.history) == 5
    assert _reports(caplog)[0][1:] == (Found.NOT_COMPUTABLE, Outcome.KEPT)


def test_a_slide_without_a_check_is_read_back_as_one():
    """As a kept lesson and the lesson view read it."""
    kept = {
        "title": "Fractions",
        "slides": [
            {
                "slideType": "concept_introduction",
                "title": "Parts",
                "bodyMd": "Body",
                "assessment": None,
            }
        ],
    }

    lesson = Lesson.model_validate(kept)

    assert lesson.slides[0].assessment is None
    assert wire(lesson)["slides"][0]["assessment"] is None

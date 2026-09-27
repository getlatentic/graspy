"""The lesson pipeline, with what each stage was asked read back."""

import json
from pathlib import Path
from unittest.mock import ANY

import pytest
from dspy.utils.exceptions import AdapterParseError
from lesson_example import wire
from stand_in import inputs, stand_in

from app.domains.lesson.generator import NO_NOTES
from app.domains.lesson.service import LessonRequest, LessonService
from app.learner.store import InMemoryLearnerStore
from app.lessons.making import Job, LessonTarget
from app.lessons.run import LessonRunner
from app.lessons.store import InMemoryLessonStore

COUNTRY = "Nigeria"
SUBJECT = "Mathematics"
TOPIC = "Algebra"
GRADE = "JSS 1"

# Classes as the apps name them.
PRIMARY_2 = "Primary 2 (Primary), Nigeria, age 7"
PRIMARY_5 = "Primary 5 (Primary), Nigeria, age 10"
JSS_1 = "JSS 1 (Junior Secondary School), Nigeria, age 12"
SS_2 = "SS 2 (Senior Secondary School), Nigeria, age 16"
# Each lesson call's system prompt exactly as it was before stages.
WITHOUT_STAGE = json.loads(
    (Path(__file__).parent / "lesson_prompts_without_stage.json").read_text()
)

# LessonPlan requires between three and six slide specs, so three is the
# smallest lesson the schema allows.
MIN_SLIDES = 3

OBJECTIVES = ["Name a variable", "Solve for x", "Check a result"]
KEY_POINTS = ["A variable stands for a number", "Both sides stay equal."]
YORUBA_SUMMARY = {
    "learningObjectives": ["Dárúkọ oníyípadà", "Wá x", "Ṣàyẹ̀wò èsì"],
    "keyPoints": ["Oníyípadà dúró fún nọ́mbà"],
}


def _plan(slide_count=MIN_SLIDES):
    return {
        "learningObjectives": OBJECTIVES,
        "keyPoints": KEY_POINTS,
        "slideSpecs": [
            {
                "slideType": "concept_introduction",
                "title": f"Spec {i}",
                "keyConcept": "Variables",
            }
            for i in range(slide_count)
        ],
    }


def _slide(title="Slide", body="Body text"):
    return {
        "slideType": "concept_introduction",
        "title": title,
        "bodyMd": body,
        "assessment": {
            "prompt": "What is x?",
            "options": ["1", "2"],
            "answerIndex": 0,
            "correctFeedback": "Correct",
            "incorrectFeedback": "Try again",
        },
    }


def _shown_slide(title):
    """A slide as the client receives it, with the assessment type filled in."""
    slide = _slide(title)
    return {**slide, "assessment": {**slide["assessment"], "type": "choice"}}


def _practice(question="What is 2 + 2?", options=None):
    return {
        "question": question,
        "options": options or ["3", "4", "5"],
        "answerIndex": 1,
        "correctFeedback": "Correct",
        "incorrectFeedback": "Try again",
    }


def _written_slide(slide):
    """A slide as the model writes it: one plain-text field per piece of text."""
    check = slide["assessment"]
    return {
        "reasoning": "r",
        "title": slide["title"],
        "body_md": slide["bodyMd"],
        "question": check["prompt"],
        "options": "\n".join(f"- {option}" for option in check["options"]),
        "answer_index": check["answerIndex"],
        "correct_feedback": check["correctFeedback"],
        "incorrect_feedback": check["incorrectFeedback"],
    }


def _written_practice(practice):
    return {
        "reasoning": "r",
        "question": practice["question"],
        "options": "\n".join(f"- {option}" for option in practice["options"]),
        "answer_index": practice["answerIndex"],
        "correct_feedback": practice["correctFeedback"],
        "incorrect_feedback": practice["incorrectFeedback"],
    }


def _translated(written):
    """A written slide or practice as its translation returns it."""
    return {
        ("reasoning" if key == "reasoning" else f"translated_{key}"): value
        for key, value in written.items()
        if key != "answer_index"
    }


def _answers(slide_count=MIN_SLIDES, *, slide=None, practice=None, translated=False):
    """Every model answer a lesson needs, in the order the pipeline asks.

    A translated lesson also asks for the plan's summary, each slide and the
    practice question in the learner's language, each straight after the
    English original.
    """
    out = [{"reasoning": "r", "plan": _plan(slide_count)}]
    if translated:
        out.append({"reasoning": "r", "translated_summary": YORUBA_SUMMARY})
    for i in range(slide_count):
        out.append(_written_slide(slide or _slide(f"Slide {i}")))
        if translated:
            out.append(_translated(_written_slide(_slide(f"Ìwé {i}"))))
    out.append(_written_practice(practice or _practice()))
    if translated:
        out.append(_translated(_written_practice(_practice("Kí ni 2 + 2?"))))
    return out


async def _stream(answers, language="English", grade=GRADE):
    """The events as the app receives them."""
    lm, context = stand_in(answers)
    request = LessonRequest(COUNTRY, language, SUBJECT, TOPIC, grade)
    with context:
        events = [event async for event in LessonService().events(request)]
    return lm, json.loads(json.dumps(events, default=wire))


def _slide_events(titles, *, translating=None):
    events = []
    for i, title in enumerate(titles):
        events.append(
            {
                "type": "status",
                "phase": "generating_slides",
                "message": f"Generating slide {i + 1}/3: Spec {i}...",
            }
        )
        if translating:
            events.append(
                {
                    "type": "status",
                    "phase": "generating_slides",
                    "message": f"Translating slide {i + 1} to {translating}...",
                }
            )
        events.append(
            {
                "type": "slide",
                "phase": "generating_slides",
                "payload": _shown_slide(title),
                "index": i,
                "total": 3,
            }
        )
    return events


async def test_an_english_lesson_streams_each_stage_in_order():
    _, events = await _stream(_answers())

    assert events == [
        {"type": "status", "phase": "planning", "message": "Creating lesson plan..."},
        {
            "type": "plan",
            "phase": "generating_slides",
            "payload": _plan(),
            "message": "Plan created: 3 slides",
        },
        *_slide_events(["Slide 0", "Slide 1", "Slide 2"]),
        {
            "type": "status",
            "phase": "slides_ready",
            "message": "Slides ready. Finishing touches...",
        },
        {
            "type": "status",
            "phase": "generating_practice",
            "message": "Generating practice question...",
        },
        {"type": "practice", "phase": "complete", "payload": _practice()},
        {"type": "complete", "phase": "complete", "payload": ANY},
    ]


async def test_a_yoruba_lesson_announces_and_streams_each_translation():
    """The slide specs stay in English: they instruct the model, not the learner."""
    _, events = await _stream(_answers(translated=True), language="Yoruba")

    assert events == [
        {"type": "status", "phase": "planning", "message": "Creating lesson plan..."},
        {
            "type": "status",
            "phase": "planning",
            "message": "Translating the lesson plan to Yoruba...",
        },
        {
            "type": "plan",
            "phase": "generating_slides",
            "payload": {**_plan(), **YORUBA_SUMMARY},
            "message": "Plan created: 3 slides",
        },
        *_slide_events(["Ìwé 0", "Ìwé 1", "Ìwé 2"], translating="Yoruba"),
        {
            "type": "status",
            "phase": "slides_ready",
            "message": "Slides ready. Finishing touches...",
        },
        {
            "type": "status",
            "phase": "generating_practice",
            "message": "Generating practice question...",
        },
        {
            "type": "status",
            "phase": "generating_practice",
            "message": "Translating practice question to Yoruba...",
        },
        {"type": "practice", "phase": "complete", "payload": _practice("Kí ni 2 + 2?")},
        {"type": "complete", "phase": "complete", "payload": ANY},
    ]


def _summary_of(*titles):
    return "Previous slides covered:\n" + "\n".join(
        f"{n}. {title}: What is x?" for n, title in enumerate(titles, 1)
    )


async def test_each_stage_is_asked_about_the_learners_lesson():
    """A class the catalogue cannot place, such as "JSS 1" alone, is written
    for by its grade, as before stages were known."""
    lm, _ = await _stream(_answers())
    lesson = {
        "subject": SUBJECT,
        "topic": TOPIC,
        "grade_level": GRADE,
        "country": COUNTRY,
        "language": "English",
    }

    assert inputs(lm, 0) == {
        "country": COUNTRY,
        "language": "English",
        "subject": SUBJECT,
        "topic": TOPIC,
        "grade_level": GRADE,
        "learner_notes": NO_NOTES,
    }
    for i, context in enumerate(
        [
            "This is the first slide of the lesson.",
            _summary_of("Slide 0"),
            _summary_of("Slide 0", "Slide 1"),
        ]
    ):
        slide_call = inputs(lm, 1 + i)
        assert json.loads(slide_call.pop("slide_spec"))["title"] == f"Spec {i}"
        assert slide_call == {**lesson, "previous_context": context}
    assert inputs(lm, 4) == {
        **lesson,
        "lesson_summary": _summary_of("Slide 0", "Slide 1", "Slide 2"),
    }


@pytest.mark.parametrize(
    ("grade", "stage", "age", "guided"),
    [
        (PRIMARY_2, "lower primary", "7", "Sentences of at most 10 words."),
        (PRIMARY_5, "upper primary", "10", "Sentences of at most 14 words."),
        (JSS_1, "junior secondary", "12", "the subject's proper terms"),
        (SS_2, "senior secondary", "16", "and no more: no calculation"),
    ],
)
async def test_the_plan_each_slide_and_the_practice_are_told_the_stage_and_age(
    grade, stage, age, guided
):
    lm, _ = await _stream(_answers(), grade=grade)

    for call in range(MIN_SLIDES + 2):
        asked = inputs(lm, call)
        assert asked["grade_level"] == grade
        assert (asked["stage"], asked["age"]) == (stage, age)
        assert guided in asked["stage_guidance"]


@pytest.mark.parametrize("grade", [GRADE, "Standard", "Primary 2"])
async def test_a_class_the_catalogue_cannot_place_is_asked_word_for_word_as_before(
    grade,
):
    """Measured: even inputs saying the stage was not known took local
    examples out of its lessons."""
    lm, _ = await _stream(_answers(), grade=grade)

    asked = [lm.history[call]["messages"][0]["content"] for call in range(5)]
    assert asked == [
        WITHOUT_STAGE["GenerateLessonPlan"],
        *[WITHOUT_STAGE["GenerateSlide"]] * MIN_SLIDES,
        WITHOUT_STAGE["GeneratePracticeQuestion"],
    ]


async def test_a_placed_class_is_asked_with_the_stage_added_to_the_same_prompt():
    lm, _ = await _stream(_answers(), grade=PRIMARY_2)

    plan = lm.history[0]["messages"][0]["content"]
    assert plan != WITHOUT_STAGE["GenerateLessonPlan"]
    assert "`stage_guidance`" in plan
    assert "Create a pedagogical lesson plan." in plan


async def test_an_undergraduate_lesson_is_written_for_an_adult():
    lm, _ = await _stream(_answers(), grade="Undergraduate student, studying Law")

    asked = inputs(lm, 0)
    assert (asked["stage"], asked["age"]) == ("after school", "an adult")
    assert "academic language" in asked["stage_guidance"]


async def test_a_translated_lesson_is_written_in_english_and_read_back_in_english():
    """Later slides and the practice question build on the English slides, not
    on translations of them."""
    lm, _ = await _stream(_answers(translated=True), language="Yoruba")

    assert inputs(lm, 0)["language"] == "English"
    assert json.loads(inputs(lm, 1)["summary"]) == {
        "learning_objectives": OBJECTIVES,
        "key_points": KEY_POINTS,
    }
    assert inputs(lm, 1)["target_language"] == "Yoruba"
    assert inputs(lm, 4)["previous_context"] == _summary_of("Slide 0")
    assert [inputs(lm, call)["target_language"] for call in (3, 5, 7, 9)] == [
        "Yoruba"
    ] * 4
    assert [inputs(lm, call)["title"] for call in (3, 5, 7)] == [
        "Slide 0",
        "Slide 1",
        "Slide 2",
    ]
    assert inputs(lm, 8)["language"] == "English"
    assert inputs(lm, 8)["lesson_summary"] == _summary_of(
        "Slide 0", "Slide 1", "Slide 2"
    )
    assert inputs(lm, 9)["question"] == "What is 2 + 2?"
    assert inputs(lm, 9)["options"] == "- 3\n- 4\n- 5"


async def test_the_finished_lesson_is_everything_the_client_shows():
    _, events = await _stream(_answers())
    slides = [_shown_slide(f"Slide {i}") for i in range(3)]

    assert events[-1]["payload"] == {
        "success": True,
        "lesson": {
            "title": "Algebra",
            "content": "Lesson plan for Algebra",
            "keyPoints": KEY_POINTS,
            "objectives": OBJECTIVES,
            "slides": slides,
            "examples": [],
            "practice": _practice(),
            "progress": {"current": 0, "total": 4},
        },
    }


async def test_a_translated_lesson_shows_the_learner_only_their_language():
    _, events = await _stream(_answers(translated=True), language="Yoruba")
    lesson = events[-1]["payload"]

    assert lesson["success"] is True
    assert lesson["lesson"]["keyPoints"] == YORUBA_SUMMARY["keyPoints"]
    assert lesson["lesson"]["objectives"] == YORUBA_SUMMARY["learningObjectives"]
    assert [slide["title"] for slide in lesson["lesson"]["slides"]] == [
        "Ìwé 0",
        "Ìwé 1",
        "Ìwé 2",
    ]


async def test_a_lesson_grown_from_its_events_has_the_finished_lessons_shape():
    """A view reads the lesson being made and the finished one alike."""
    target = LessonTarget(
        plan_id="plan-1",
        subject_slug="mathematics",
        subject=SUBJECT,
        topic_index=0,
        topic=TOPIC,
        total_topics=3,
        country=COUNTRY,
        language="English",
        grade_level=GRADE,
    )
    saved = []

    async def save(making):
        saved.append(making)

    runner = LessonRunner(
        LessonService(), InMemoryLessonStore(), InMemoryLearnerStore()
    )
    _, context = stand_in(_answers())
    with context:
        await runner(Job(target=target), save)

    grown, finished = saved[-2], saved[-1]
    assert (grown.status, finished.status) == ("making", "ready")
    grown, finished = wire(grown.lesson), wire(finished.lesson)
    assert list(grown) == list(finished)
    assert list(grown["progress"]) == list(finished["progress"])
    read_alike = ("keyPoints", "objectives", "slides", "examples", "practice")
    assert {key: grown[key] for key in read_alike} == {
        key: finished[key] for key in read_alike
    }


@pytest.mark.parametrize("language", ["Yoruba", "Hausa", "Igbo"])
async def test_every_translated_language_takes_the_translation_path(language):
    _, events = await _stream(_answers(translated=True), language=language)

    assert events[-1]["payload"]["success"] is True
    assert events[-1]["payload"]["lesson"]["practice"]["question"] == "Kí ni 2 + 2?"


async def test_the_plan_schema_caps_the_number_of_slides():
    """Each slide is another model call, so the slide count bounds the bill.

    LessonPlan allows at most six specs; nothing else caps a lesson.
    """
    _, events = await _stream(_answers(slide_count=6))
    assert len(events[-1]["payload"]["lesson"]["slides"]) == 6

    with pytest.raises(AdapterParseError):
        await _stream(_answers(slide_count=7))


async def test_latex_escaping_is_repaired_before_the_learner_sees_it():
    _, events = await _stream(_answers(slide=_slide(body="Solve @@frac{1}{2}")))

    assert (
        events[-1]["payload"]["lesson"]["slides"][0]["bodyMd"]
        == "Solve <latex-inline>\\frac{1}{2}</latex-inline>"
    )


async def test_latex_is_repaired_in_every_field_the_learner_reads():
    half = "( @@frac12)"
    shown = "( <latex-inline>\\frac12</latex-inline>)"
    slide = _slide(title=f"Title {half}", body="Body")
    slide["assessment"] |= {
        "prompt": half,
        "correctFeedback": half,
        "incorrectFeedback": half,
    }
    practice = _practice(question=half) | {
        "correctFeedback": half,
        "incorrectFeedback": half,
    }

    _, events = await _stream(_answers(slide=slide, practice=practice))

    lesson = events[-1]["payload"]["lesson"]
    assessment = lesson["slides"][0]["assessment"]
    assert lesson["slides"][0]["title"] == f"Title {shown}"
    assert [
        assessment[key] for key in ("prompt", "correctFeedback", "incorrectFeedback")
    ] == [shown] * 3
    assert [
        lesson["practice"][key]
        for key in ("question", "correctFeedback", "incorrectFeedback")
    ] == [shown] * 3


async def test_money_in_a_question_is_not_turned_into_maths():
    answers = _answers(
        practice=_practice(options=["A shirt costs $20 and a hat costs $15.", "b", "c"])
    )

    _, events = await _stream(answers)

    assert (
        events[-1]["payload"]["lesson"]["practice"]["options"][0]
        == "A shirt costs $20 and a hat costs $15."
    )


def _warnings(events):
    return [
        (event["phase"], event["message"])
        for event in events
        if event["type"] == "warning"
    ]


async def test_a_complete_lesson_raises_no_warning(caplog):
    await _stream(_answers())

    assert "incomplete" not in caplog.text


async def test_a_lost_slide_is_a_warning_and_the_lesson_goes_on(caplog):
    """The client ends the lesson on an error, so a survivable loss must not be
    one; reporting success would have the client cache the gap as finished."""
    answers = _answers()
    # The second slide comes back without its fields, and again when it is
    # written once more. Removing the answer would starve every later call
    # and prove nothing about this one.
    answers[2] = {"reasoning": "r"}
    answers.insert(3, {"reasoning": "r"})

    _, events = await _stream(answers)

    assert _warnings(events) == [("generating_slides", "Slide 2 could not be written.")]
    assert "error" not in [event["type"] for event in events]
    assert [slide["title"] for slide in events[-1]["payload"]["lesson"]["slides"]] == [
        "Slide 0",
        "Slide 2",
    ]
    assert events[-1]["payload"]["success"] is False
    assert "Slide 2 of Mathematics/Algebra failed" in caplog.messages
    assert (
        "Lesson for Mathematics/Algebra is incomplete: 2 of 3 slides, untranslated: nothing"
        in caplog.messages
    )


async def test_an_untranslated_plan_is_shown_in_english_and_the_lesson_goes_on(caplog):
    answers = _answers(translated=True)
    answers[1] = {"reasoning": "r"}

    _, events = await _stream(answers, language="Yoruba")

    assert _warnings(events) == [
        (
            "planning",
            "The lesson plan could not be translated, so it is shown in English.",
        )
    ]
    assert events[-1]["payload"]["lesson"]["keyPoints"] == KEY_POINTS
    assert events[-1]["payload"]["lesson"]["slides"][0]["title"] == "Ìwé 0"
    assert events[-1]["payload"]["success"] is False
    assert "Lesson plan for Mathematics/Algebra was not translated" in caplog.messages
    assert (
        "Lesson for Mathematics/Algebra is incomplete: 3 of 3 slides, untranslated: plan"
        in caplog.messages
    )


async def test_an_untranslated_practice_question_is_shown_in_english_and_the_lesson_goes_on(
    caplog,
):
    answers = _answers(translated=True)
    answers[-1] = {"reasoning": "r"}

    _, events = await _stream(answers, language="Yoruba")

    assert _warnings(events) == [
        (
            "generating_practice",
            "The practice question could not be translated, so it is shown in English.",
        )
    ]
    assert events[-1]["payload"]["lesson"]["practice"]["question"] == "What is 2 + 2?"
    assert events[-1]["payload"]["lesson"]["slides"][0]["title"] == "Ìwé 0"
    assert events[-1]["payload"]["success"] is False
    assert (
        "Practice question for Mathematics/Algebra was not translated"
        in caplog.messages
    )
    assert (
        "Lesson for Mathematics/Algebra is incomplete: 3 of 3 slides, untranslated: practice question"
        in caplog.messages
    )


async def test_every_untranslated_part_is_named_in_the_warning(caplog):
    answers = _answers(translated=True)
    answers[1] = {"reasoning": "r"}
    answers[-1] = {"reasoning": "r"}

    _, events = await _stream(answers, language="Yoruba")

    assert [phase for phase, _ in _warnings(events)] == [
        "planning",
        "generating_practice",
    ]
    assert (
        "Lesson for Mathematics/Algebra is incomplete: 3 of 3 slides, untranslated: plan, practice question"
        in caplog.messages
    )


async def test_a_translation_that_loses_an_option_is_shown_in_english():
    """The answer index points into the original options; a shorter list
    would mark the wrong choice right."""
    answers = _answers(translated=True)
    answers[-1]["translated_options"] = "- Mẹ́ta\n- Mẹ́rin"

    _, events = await _stream(answers, language="Yoruba")

    assert events[-1]["payload"]["lesson"]["practice"]["question"] == "What is 2 + 2?"
    assert [phase for phase, _ in _warnings(events)] == ["generating_practice"]


async def test_a_slide_whose_answer_is_not_an_option_is_not_shown():
    answers = _answers()
    # Wrong both times it is written.
    answers[1]["answer_index"] = 7
    answers.insert(2, {**answers[1]})

    _, events = await _stream(answers)

    assert [phase for phase, _ in _warnings(events)] == ["generating_slides"]
    assert len(events[-1]["payload"]["lesson"]["slides"]) == MIN_SLIDES - 1


async def test_the_plan_is_aimed_at_the_learners_record():
    lm, context = stand_in(_answers())
    request = LessonRequest(
        country=COUNTRY,
        language="English",
        subject=SUBJECT,
        topic=TOPIC,
        grade_level=GRADE,
        learner_notes="Recent mistakes: halves",
    )

    with context:
        events = [event async for event in LessonService().events(request)]

    assert events[-1]["payload"].success is True
    assert inputs(lm, 0)["learner_notes"] == "Recent mistakes: halves"


async def test_a_slide_that_comes_back_unusable_is_written_again():
    """The model can write a 23-row table into a check's options."""
    answers = _answers()
    unusable = {**answers[2], "options": "\n".join(f"- row {n}" for n in range(23))}
    answers.insert(2, unusable)

    lm, events = await _stream(answers)

    assert [slide["title"] for slide in events[-1]["payload"]["lesson"]["slides"]] == [
        "Slide 0",
        "Slide 1",
        "Slide 2",
    ]
    assert events[-1]["payload"]["success"] is True
    assert _warnings(events) == []
    assert lm.history[3]["kwargs"]["temperature"] == 0.7


async def test_a_lower_primary_lesson_is_not_given_the_tutors_answer_rule():
    lm, _ = await _stream(_answers(), grade=PRIMARY_2)

    for call in range(MIN_SLIDES + 2):
        assert "short numbered steps" not in inputs(lm, call)["stage_guidance"]

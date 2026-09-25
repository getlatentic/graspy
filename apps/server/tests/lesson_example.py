"""One small lesson, as the pipeline makes it, for tests that keep, grow or
serve a lesson."""

from app.domains.lesson.lesson import (
    Lesson,
    LessonPractice,
    LessonProgress,
    LessonSlide,
    LessonSlideAssessment,
)

SLIDE = LessonSlide(
    slide_type="concept_introduction",
    title="Parts",
    body_md="A fraction is part of a whole.",
    assessment=LessonSlideAssessment(
        prompt="Which is bigger, 1/2 or 1/3?",
        options=["1/2", "1/3"],
        answer_index=0,
        correct_feedback="Two parts are bigger than three.",
        incorrect_feedback="More parts make each smaller.",
    ),
)
PRACTICE = LessonPractice(
    question="What is 1/4 of 8?",
    options=["2", "4"],
    answer_index=0,
    correct_feedback="8 shared among 4 is 2.",
    incorrect_feedback="Share 8 among 4.",
)
LESSON = Lesson(
    title="Fractions",
    content="Lesson plan for Fractions",
    key_points=["k"],
    objectives=["o"],
    slides=[SLIDE],
    practice=PRACTICE,
    progress=LessonProgress(current=0, total=2),
)


def wire(model) -> dict:
    """A model as the app and the views receive it."""
    return model.model_dump(by_alias=True)

"""The model's side of a lesson, one DSPy call per part; the service decides
the order."""

from __future__ import annotations

import dspy

from ...config.stage_writing import WRITING
from ...education.stage import stage_of
from .lesson import LessonPractice, LessonSlide, LessonSlideAssessment
from .options import as_option_lines, checked_answer, option_lines
from .prompts import (
    GenerateLessonPlan,
    GeneratePracticeQuestion,
    GenerateSlide,
    LessonPlan,
    PlanSummary,
    SlideSpec,
    TranslateLessonPractice,
    TranslateLessonSlide,
    TranslatePlanSummary,
)

NO_NOTES = "None: plan for a typical learner at this grade."
NOT_KNOWN = "Not known"
NO_STAGE_GUIDANCE = "None: write for the grade in `grade_level`."
# A slide written again is written with some sampling, or the model would
# write the same unusable slide, and a cache would return it.
RETRY_TEMPERATURE = 0.7


def stage_inputs(grade_level: str) -> dict[str, str]:
    """The learner's stage, age and how to write for them, each its own
    input; a class the catalogue cannot place leaves the grade to say it."""
    learner = stage_of(grade_level)
    if learner is None:
        return {
            "stage": NOT_KNOWN,
            "age": NOT_KNOWN,
            "stage_guidance": NO_STAGE_GUIDANCE,
        }
    return {
        "stage": learner.stage.value,
        "age": learner.age_text(),
        "stage_guidance": WRITING[learner.stage].guidance(),
    }


class StagedLessonGenerator(dspy.Module):
    def __init__(self):
        super().__init__()
        self.plan_generator = dspy.ChainOfThought(GenerateLessonPlan)
        self.slide_generator = dspy.ChainOfThought(GenerateSlide)
        self.practice_generator = dspy.ChainOfThought(GeneratePracticeQuestion)
        self.translate_summary = dspy.ChainOfThought(TranslatePlanSummary)
        self.translate_slide = dspy.ChainOfThought(TranslateLessonSlide)
        self.translate_practice = dspy.ChainOfThought(TranslateLessonPractice)

    async def generate_plan(
        self,
        country: str,
        language: str,
        subject: str,
        topic: str,
        grade_level: str,
        learner_notes: str = "",
    ) -> LessonPlan:
        prediction = await self.plan_generator.acall(
            country=country,
            language=language,
            subject=subject,
            topic=topic,
            grade_level=grade_level,
            **stage_inputs(grade_level),
            learner_notes=learner_notes or NO_NOTES,
        )
        return prediction.plan

    async def generate_slide(
        self,
        slide_spec: SlideSpec,
        subject: str,
        topic: str,
        grade_level: str,
        language: str,
        previous_context: str,
        country: str,
        again: bool = False,
    ) -> LessonSlide:
        written = await self.slide_generator.acall(
            subject=subject,
            topic=topic,
            grade_level=grade_level,
            **stage_inputs(grade_level),
            language=language,
            country=country,
            slide_spec=slide_spec,
            previous_context=previous_context,
            **({"config": {"temperature": RETRY_TEMPERATURE}} if again else {}),
        )
        options = option_lines(written.options)
        return LessonSlide(
            slide_type=slide_spec.slide_type,
            title=written.title,
            body_md=written.body_md,
            assessment=LessonSlideAssessment(
                prompt=written.question,
                options=options,
                answer_index=checked_answer(written.answer_index, options),
                correct_feedback=written.correct_feedback,
                incorrect_feedback=written.incorrect_feedback,
            ),
        )

    async def generate_practice(
        self,
        subject: str,
        topic: str,
        grade_level: str,
        language: str,
        country: str,
        lesson_summary: str,
    ) -> LessonPractice:
        written = await self.practice_generator.acall(
            subject=subject,
            topic=topic,
            grade_level=grade_level,
            **stage_inputs(grade_level),
            language=language,
            country=country,
            lesson_summary=lesson_summary,
        )
        options = option_lines(written.options)
        return LessonPractice(
            question=written.question,
            options=options,
            answer_index=checked_answer(written.answer_index, options),
            correct_feedback=written.correct_feedback,
            incorrect_feedback=written.incorrect_feedback,
        )

    async def translate_plan_summary(
        self, plan: LessonPlan, language: str
    ) -> LessonPlan:
        """The slide specs stay in English: they instruct the model, not the
        learner."""
        summary = PlanSummary(
            learning_objectives=plan.learning_objectives, key_points=plan.key_points
        )
        prediction = await self.translate_summary.acall(
            summary=summary, target_language=language
        )
        translated = prediction.translated_summary
        return plan.model_copy(
            update={
                "learning_objectives": translated.learning_objectives,
                "key_points": translated.key_points,
            }
        )

    async def translate_slide_content(
        self, slide: LessonSlide, language: str
    ) -> LessonSlide:
        check = slide.assessment
        written = await self.translate_slide.acall(
            target_language=language,
            title=slide.title,
            body_md=slide.body_md,
            question=check.prompt,
            options=as_option_lines(check.options),
            correct_feedback=check.correct_feedback,
            incorrect_feedback=check.incorrect_feedback,
        )
        return slide.model_copy(
            update={
                "title": written.translated_title,
                "body_md": written.translated_body_md,
                "assessment": check.model_copy(
                    update={
                        "prompt": written.translated_question,
                        "options": same_count(
                            option_lines(written.translated_options), check.options
                        ),
                        "correct_feedback": written.translated_correct_feedback,
                        "incorrect_feedback": written.translated_incorrect_feedback,
                    }
                ),
            }
        )

    async def translate_practice_content(
        self, practice: LessonPractice, language: str
    ) -> LessonPractice:
        written = await self.translate_practice.acall(
            target_language=language,
            question=practice.question,
            options=as_option_lines(practice.options),
            correct_feedback=practice.correct_feedback,
            incorrect_feedback=practice.incorrect_feedback,
        )
        return practice.model_copy(
            update={
                "question": written.translated_question,
                "options": same_count(
                    option_lines(written.translated_options), practice.options
                ),
                "correct_feedback": written.translated_correct_feedback,
                "incorrect_feedback": written.translated_incorrect_feedback,
            }
        )


def same_count(translated: list[str], original: list[str]) -> list[str]:
    """The answer index points into the original list."""
    if len(translated) != len(original):
        raise ValueError(
            f"Translation returned {len(translated)} options for {len(original)}"
        )
    return translated

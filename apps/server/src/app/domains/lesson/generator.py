"""The model's side of a lesson, one DSPy call per part; the service decides
the order."""

from __future__ import annotations

import dspy

from ...education.stage import stage_of
from .answers.written import written as written_value
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
    TranslateSlideText,
)
from .rewritten import (
    CHECK_PROBLEM,
    RewrittenPracticeQuestion,
    RewrittenSlide,
    RewrittenStagedPracticeQuestion,
    RewrittenStagedSlide,
)
from .staged import (
    StagedLessonPlan,
    StagedPracticeQuestion,
    StagedSlide,
    stage_inputs,
)

NO_NOTES = "None: plan for a typical learner at this grade."
# A slide written again is written with some sampling, or the model would
# write the same unusable slide, and a cache would return it.
RETRY_TEMPERATURE = 0.7


def _second_try(again: bool, problem: str) -> dict:
    """The inputs that make a call a second try: told what was wrong with the
    check before, when it was."""
    told = {CHECK_PROBLEM: problem} if problem else {}
    retried = {"config": {"temperature": RETRY_TEMPERATURE}} if again or problem else {}
    return told | retried


def _asked(
    plain: dspy.Module, staged: dspy.Module, grade_level: str
) -> tuple[dspy.Module, dict[str, str]]:
    """The predictor for the learner, and the stage's inputs it needs."""
    learner = stage_of(grade_level)
    if learner is None:
        return plain, {}
    return staged, stage_inputs(learner)


class StagedLessonGenerator(dspy.Module):
    def __init__(self):
        super().__init__()
        self.plan_generator = dspy.ChainOfThought(GenerateLessonPlan)
        self.slide_generator = dspy.ChainOfThought(GenerateSlide)
        self.practice_generator = dspy.ChainOfThought(GeneratePracticeQuestion)
        self.staged_plan_generator = dspy.ChainOfThought(StagedLessonPlan)
        self.staged_slide_generator = dspy.ChainOfThought(StagedSlide)
        self.staged_practice_generator = dspy.ChainOfThought(StagedPracticeQuestion)
        self.rewritten_slide_generator = dspy.ChainOfThought(RewrittenSlide)
        self.rewritten_staged_slide_generator = dspy.ChainOfThought(
            RewrittenStagedSlide
        )
        self.rewritten_practice_generator = dspy.ChainOfThought(
            RewrittenPracticeQuestion
        )
        self.rewritten_staged_practice_generator = dspy.ChainOfThought(
            RewrittenStagedPracticeQuestion
        )
        self.translate_summary = dspy.ChainOfThought(TranslatePlanSummary)
        self.translate_slide = dspy.ChainOfThought(TranslateLessonSlide)
        self.translate_slide_text = dspy.ChainOfThought(TranslateSlideText)
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
        planner, stage = _asked(
            self.plan_generator, self.staged_plan_generator, grade_level
        )
        prediction = await planner.acall(
            country=country,
            language=language,
            subject=subject,
            topic=topic,
            grade_level=grade_level,
            **stage,
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
        problem: str = "",
    ) -> LessonSlide:
        writers = (
            (self.rewritten_slide_generator, self.rewritten_staged_slide_generator)
            if problem
            else (self.slide_generator, self.staged_slide_generator)
        )
        writer, stage = _asked(*writers, grade_level)
        written = await writer.acall(
            subject=subject,
            topic=topic,
            grade_level=grade_level,
            **stage,
            language=language,
            country=country,
            slide_spec=slide_spec,
            previous_context=previous_context,
            **_second_try(again, problem),
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
        problem: str = "",
    ) -> LessonPractice:
        writers = (
            (
                self.rewritten_practice_generator,
                self.rewritten_staged_practice_generator,
            )
            if problem
            else (self.practice_generator, self.staged_practice_generator)
        )
        writer, stage = _asked(*writers, grade_level)
        written = await writer.acall(
            subject=subject,
            topic=topic,
            grade_level=grade_level,
            **stage,
            language=language,
            country=country,
            lesson_summary=lesson_summary,
            **_second_try(False, problem),
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
        if check is None:
            return await self._translate_slide_text(slide, language)
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
                        "options": same_options(
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
                "options": same_options(
                    option_lines(written.translated_options), practice.options
                ),
                "correct_feedback": written.translated_correct_feedback,
                "incorrect_feedback": written.translated_incorrect_feedback,
            }
        )

    async def _translate_slide_text(
        self, slide: LessonSlide, language: str
    ) -> LessonSlide:
        written = await self.translate_slide_text.acall(
            target_language=language, title=slide.title, body_md=slide.body_md
        )
        return slide.model_copy(
            update={
                "title": written.translated_title,
                "body_md": written.translated_body_md,
            }
        )


def same_options(translated: list[str], original: list[str]) -> list[str]:
    """The answer index points into the original list, which was checked: a
    translation keeps every option, in order, and every number in it."""
    if len(translated) != len(original):
        raise ValueError(
            f"Translation returned {len(translated)} options for {len(original)}"
        )
    for before, after in zip(original, translated, strict=True):
        was, now = written_value(before), written_value(after)
        if was and now and was.value != now.value:
            raise ValueError(f"Translation changed option {before!r} to {after!r}")
    return translated

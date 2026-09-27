import dspy
from pydantic import BaseModel, ConfigDict, Field

from .lesson import SlideType


class SlideSpec(BaseModel):
    slide_type: SlideType = Field(alias="slideType", description="Pedagogical type")
    title: str = Field(description="Slide title")
    key_concept: str = Field(alias="keyConcept", description="Key concept to cover")

    model_config = ConfigDict(populate_by_name=True)


class LessonPlan(BaseModel):
    learning_objectives: list[str] = Field(
        alias="learningObjectives",
        min_length=3,
        max_length=5,
        description="Measurable objectives",
    )
    key_points: list[str] = Field(alias="keyPoints", description="3-5 key takeaways")
    # The only cap on a lesson's cost: each spec is one model call, or two
    # when translated.
    slide_specs: list[SlideSpec] = Field(
        alias="slideSpecs", min_length=3, max_length=6, description="Sequence of slides"
    )

    model_config = ConfigDict(populate_by_name=True)


class PlanSummary(BaseModel):
    learning_objectives: list[str] = Field(alias="learningObjectives")
    key_points: list[str] = Field(alias="keyPoints")

    model_config = ConfigDict(populate_by_name=True)


STAGE_DESC = "The learner's stage of schooling"
AGE_DESC = "The learner's age"
STAGE_GUIDANCE_DESC = "How to write for this stage and age"


class GenerateLessonPlan(dspy.Signature):
    """
    Create a pedagogical lesson plan.
    Break down the topic into a logical specific sequence of 3-6 slides.
    Ensure a mix of concept, example, and practice slides.
    Size each slide's idea and steps for `stage` and `age`, as `stage_guidance` says.
    """

    country: str = dspy.InputField(desc="Target country for cultural context")
    language: str = dspy.InputField(desc="Language of instruction")
    subject: str = dspy.InputField(desc="The academic subject")
    topic: str = dspy.InputField(desc="Specific topic to teach")
    grade_level: str = dspy.InputField(desc="Target grade level")
    stage: str = dspy.InputField(desc=STAGE_DESC)
    age: str = dspy.InputField(desc=AGE_DESC)
    stage_guidance: str = dspy.InputField(desc=STAGE_GUIDANCE_DESC)
    learner_notes: str = dspy.InputField(
        desc="What this learner has finished and recently got wrong. Aim the "
        "plan at it: a misconception slide for a mistake they keep making, "
        "less time on what they have shown they know. Never mention it."
    )

    plan: LessonPlan = dspy.OutputField(
        desc="Structured lesson plan with slide specifications"
    )


# Every learner-facing field is its own plain-text output: inside a JSON
# object, LaTeX comes back mangled whichever way the model is told to escape
# it.
MATH_NOTATION = r"""Mathematics is standard LaTeX: inline between \( and \), as \(\frac{1}{2}\),
and a standout equation on a line of its own between \[ and \]. Chemistry
uses \ce{} inside those, as \(\ce{H2O}\). Never use dollar signs for maths:
they mean money. Use only commands KaTeX renders: write a ceiling as
\lceil x \rceil. Letters, words and speech sounds are text, never maths: write
the alphabet as "A, B, C", and sounds with Unicode IPA such as /æ/ or /ʃ/.
No diagrams or TikZ."""

KEEP_MATHS = r"""Translate the words around mathematics, never the mathematics: keep every
span between \( and \) or \[ and \] exactly as it is. Keep the Markdown
formatting, and keep the options in the same order, one per line."""

OPTIONS_DESC = "Exactly four answer options, one per line, each starting with '- '"


class GenerateSlide(dspy.Signature):
    __doc__ = f"""Write one lesson slide following `slide_spec`, and a multiple-choice check on it.

Write every field in `language`, at `grade_level`, as `stage_guidance` says,
with examples from `country`. Build on `previous_context` without repeating it.

{MATH_NOTATION}"""

    subject: str = dspy.InputField(desc="The academic subject")
    topic: str = dspy.InputField(desc="Specific topic")
    grade_level: str = dspy.InputField(desc="Target grade level")
    stage: str = dspy.InputField(desc=STAGE_DESC)
    age: str = dspy.InputField(desc=AGE_DESC)
    stage_guidance: str = dspy.InputField(desc=STAGE_GUIDANCE_DESC)
    country: str = dspy.InputField(desc="Target country for cultural context")
    language: str = dspy.InputField(
        desc="Language of instruction. Write every field in it."
    )
    previous_context: str = dspy.InputField(
        desc="Summary of what previous slides taught"
    )
    slide_spec: SlideSpec = dspy.InputField(desc="Specification for the slide to write")

    title: str = dspy.OutputField(desc="A concise slide title")
    body_md: str = dspy.OutputField(desc="The slide in Markdown")
    question: str = dspy.OutputField(desc="A question checking what the slide taught")
    options: str = dspy.OutputField(desc=OPTIONS_DESC)
    answer_index: int = dspy.OutputField(
        desc="Zero-based position of the correct option"
    )
    correct_feedback: str = dspy.OutputField(
        desc="Encouraging feedback explaining why the answer is right"
    )
    incorrect_feedback: str = dspy.OutputField(
        desc="Constructive feedback explaining the likely mistake"
    )


class GeneratePracticeQuestion(dspy.Signature):
    __doc__ = f"""Write a final practice question on the lesson: challenging, but solvable
from what the lesson taught.

Write every field in `language`, as `stage_guidance` says, with examples from
`country`.

{MATH_NOTATION}"""

    subject: str = dspy.InputField(desc="The academic subject")
    topic: str = dspy.InputField(desc="Specific topic")
    grade_level: str = dspy.InputField(desc="Target grade level")
    stage: str = dspy.InputField(desc=STAGE_DESC)
    age: str = dspy.InputField(desc=AGE_DESC)
    stage_guidance: str = dspy.InputField(desc=STAGE_GUIDANCE_DESC)
    country: str = dspy.InputField(desc="Target country for cultural context")
    language: str = dspy.InputField(
        desc="Language of instruction. Write every field in it."
    )
    lesson_summary: str = dspy.InputField(desc="Summary of the lesson content covered")

    question: str = dspy.OutputField(desc="The practice question")
    options: str = dspy.OutputField(desc=OPTIONS_DESC)
    answer_index: int = dspy.OutputField(
        desc="Zero-based position of the correct option"
    )
    correct_feedback: str = dspy.OutputField(
        desc="Encouraging feedback explaining why the answer is right"
    )
    incorrect_feedback: str = dspy.OutputField(
        desc="Constructive feedback explaining the likely mistake"
    )


class TranslateLessonSlide(dspy.Signature):
    __doc__ = f"""Translate a lesson slide and its check into `target_language`, keeping its
teaching and its examples.

{KEEP_MATHS}"""

    target_language: str = dspy.InputField(desc="The language to translate into")
    title: str = dspy.InputField()
    body_md: str = dspy.InputField()
    question: str = dspy.InputField()
    options: str = dspy.InputField()
    correct_feedback: str = dspy.InputField()
    incorrect_feedback: str = dspy.InputField()

    translated_title: str = dspy.OutputField()
    translated_body_md: str = dspy.OutputField()
    translated_question: str = dspy.OutputField()
    translated_options: str = dspy.OutputField(
        desc="The options translated, one per line, each starting with '- '"
    )
    translated_correct_feedback: str = dspy.OutputField()
    translated_incorrect_feedback: str = dspy.OutputField()


class TranslateLessonPractice(dspy.Signature):
    __doc__ = f"""Translate a practice question and its feedback into `target_language`.

{KEEP_MATHS}"""

    target_language: str = dspy.InputField(desc="The language to translate into")
    question: str = dspy.InputField()
    options: str = dspy.InputField()
    correct_feedback: str = dspy.InputField()
    incorrect_feedback: str = dspy.InputField()

    translated_question: str = dspy.OutputField()
    translated_options: str = dspy.OutputField(
        desc="The options translated, one per line, each starting with '- '"
    )
    translated_correct_feedback: str = dspy.OutputField()
    translated_incorrect_feedback: str = dspy.OutputField()


class TranslatePlanSummary(dspy.Signature):
    __doc__ = f"""Translate a lesson's learning objectives and key points into `target_language`.
Keep the same number of items in each list, in the same order.

{KEEP_MATHS}"""

    summary: PlanSummary = dspy.InputField(
        desc="The objectives and key points to translate"
    )
    target_language: str = dspy.InputField(desc="The language to translate into")

    translated_summary: PlanSummary = dspy.OutputField(
        desc="The translated objectives and key points"
    )

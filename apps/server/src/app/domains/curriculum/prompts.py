import dspy
from pydantic import BaseModel, Field


class CurriculumSubjectInput(BaseModel):
    id: str = Field(description="English slug/ID of the subject")
    label: str = Field(description="Localized label of the subject")


class CurriculumItem(BaseModel):
    subject_slug: str = Field(
        description="The English slug of the subject (e.g. 'mathematics')"
    )
    subject_label: str = Field(
        description="The localized name of the subject (e.g. 'Ìṣirò')"
    )
    topics: list[str] = Field(
        description="List of curriculum topics for this subject in the target language"
    )


class GenerateCurriculum(dspy.Signature):
    """
    Generate a curriculum with subjects and their associated topics for a specific grade level appropriate for the target country and language.

    INSTRUCTIONS:
    1. If `input_subjects` are provided, generate topics for EACH provided subject.
       - Use the provided `id` as `subject_slug`.
       - Use the provided `label` as `subject_label`.
    2. If `input_subjects` is empty, generate a comprehensive list of core subjects for the grade level.
       - Generate an English `subject_slug`.
       - Generate a `subject_label` in the target `language`.
    3. All `topics` must be in the target `language`.
    4. Ensure all topics are UNIQUE for each subject. Avoid repetitions.
    """

    country: str = dspy.InputField(desc="The target country for the curriculum")
    language: str = dspy.InputField(desc="The language of instruction")
    grade_level: str = dspy.InputField(desc="Target grade level")
    input_subjects: list[CurriculumSubjectInput] = dspy.InputField(
        desc="List of specific subjects to generate curriculum for"
    )

    curriculum: list[CurriculumItem] = dspy.OutputField(
        desc="List of subjects and their topics"
    )


class GenerateCurriculumTopics(dspy.Signature):
    """
    Generate curriculum topics for the specifically provided subjects.

    INSTRUCTIONS:
    1. For each input subject, generate a list of curriculum topics in the target `language`.
    2. Use the provided English `id` as the key in the output `topics` map.
    3. Do NOT generate new subjects or change the subject labels.
    4. Ensure that the list of topics for each subject is UNIQUE and contains NO DUPLICATES.
    """

    country: str = dspy.InputField(desc="The target country for the curriculum")
    language: str = dspy.InputField(desc="The language of instruction")
    grade_level: str = dspy.InputField(desc="Target grade level")
    input_subjects: list[CurriculumSubjectInput] = dspy.InputField(
        desc="List of specific subjects to generate topics for"
    )

    topics: dict[str, list[str]] = dspy.OutputField(
        desc="Map of subject English IDs to list of unique topics in target language"
    )


class TranslateCurriculumTopics(dspy.Signature):
    """
    Translate a list of educational topics into the target language.
    Ensure technical terms are translated accurately or transliterated if no direct translation exists.
    Keep the same order and length as the input list.
    """

    topics: list[str] = dspy.InputField(
        desc="List of topics in the source language (English)"
    )
    subject: str = dspy.InputField(
        desc="The subject context (e.g. Mathematics, Biology)"
    )
    target_language: str = dspy.InputField(desc="The language to translate into")

    translated_topics: list[str] = dspy.OutputField(desc="List of translated topics")

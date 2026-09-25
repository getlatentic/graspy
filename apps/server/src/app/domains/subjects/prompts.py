import dspy
from pydantic import BaseModel, Field


class SubjectItem(BaseModel):
    id: str = Field(
        ...,
        description="Unique identifier for the subject in English (lowercase, kebab-case), e.g. 'math' or 'civic-education'",
    )
    label: str = Field(
        ...,
        description="Display label for the subject in the target language, e.g. 'Ìṣirò'",
    )
    recommended: bool = Field(
        ...,
        description="Whether this subject is recommended based on the user's profile",
    )


class GenerateSubjects(dspy.Signature):
    """
    Generate a list of academic subjects suitable for a student in a specific country and grade level.
    List of subject should be based on the country's curriculum standards and the student's grade level.
    And the subject should be in the language of instruction.
    Mark subjects as 'recommended' if they are core or typical for the student's status.
    """

    country: str = dspy.InputField(desc="The student's country of residence")
    language: str = dspy.InputField(desc="The language of instruction")
    grade_level: str = dspy.InputField(
        desc="The student's class as their country names it, or their university level and course"
    )

    subjects: list[SubjectItem] = dspy.OutputField(desc="List of available subjects")

import dspy
from pydantic import BaseModel, Field


class PathStep(BaseModel):
    title: str = Field(description="A short topic name")
    level: str = Field(
        description="The grade or year this step is taught at, named the way the country does, "
        "e.g. 'JSS 1', 'SS 2', 'first-year university'"
    )


class PlanLearningPath(dspy.Signature):
    """Plan a route from what a learner can study now to what they want to learn.

    Start with a topic this learner can already study at their grade and end
    with the goal itself. Each step builds on the one before and rises in level
    only as far as it must. When the goal already suits the learner's grade the
    route is short; when it is far above it, the route climbs through the
    topics that make it reachable. Every step is one lesson-sized topic.
    """

    country: str = dspy.InputField(desc="The learner's country")
    language: str = dspy.InputField(desc="The language to write the name and topics in")
    grade_level: str = dspy.InputField(desc="The learner's grade now")
    goal: str = dspy.InputField(desc="What the learner asked to learn, in their words")
    subject_name: str = dspy.OutputField(
        desc="A short name for the path, e.g. 'Real analysis'"
    )
    steps: list[PathStep] = dspy.OutputField(
        desc="Between 4 and 12 steps, in the order they are learnt"
    )

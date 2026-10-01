"""Where a learner stands on each lesson, in the words the app shows."""

from datetime import date

from .curriculum import LessonPlan
from .progress_state import PlanProgress
from .sequencing import Option, plans_for_class


def lesson_standing(plan: LessonPlan, state: PlanProgress, today: date) -> str:
    """Where this learner stands on one lesson, in one word the app can colour."""
    if state.mastered:
        return "mastered"
    if state.assessed_days:
        return "learnt"
    if state.done_today or state.supported_days or state.last_day is not None:
        return "started"
    return "untouched"


def catalogue(
    plans: dict[str, LessonPlan],
    progress: dict[str, PlanProgress],
    today: date,
    learner_class: str | None,
    current: Option | None,
) -> list[dict]:
    """Every lesson of this learner's class in teaching order, with where they stand on it."""
    return [
        {
            "plan_id": plan.id,
            "subject": plan.subject,
            "topic": plan.topic,
            "title": plan.title,
            "standing": lesson_standing(plan, progress[plan.id], today),
            # The days that count towards knowing the lesson: the check passed alone. A pass that took
            # help earns none, so "one more good day" is always true.
            "days_correct": len(progress[plan.id].independent_days),
            "current": current is not None and current.plan_id == plan.id,
        }
        for plan in plans_for_class(plans, learner_class)
    ]

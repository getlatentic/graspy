"""What happened in a lesson, as the teacher reads it: an event the teacher said, or a turn the learner was marked on."""

import json
from dataclasses import dataclass
from datetime import date

from .curriculum import LessonPlan
from .lesson_store import lesson_day


@dataclass(frozen=True)
class Evidence:
    """One thing that happened: an event the teacher said, or a turn the learner was marked on."""

    plan_id: str
    event_id: str
    day: date
    decision: str | None = None
    result: dict | None = None
    exercise: dict | None = None
    # What the child was asked, when it was not the plan's own line: a list asked again from where it broke.
    prompt_id: str | None = None
    # How it was marked, and when nothing could be marked, why (see tutoring_turns.verdict).
    verdict: str | None = None
    heard_kind: str | None = None

    @property
    def unheard(self) -> bool:
        """Whether nothing could be marked and nothing says the child tried: silence, or words that were
        no answer. It is not a try, and it says nothing about what the child knows. A child saying they do
        not know did try."""
        return self.verdict == "unheard" and self.heard_kind != "dont_know"

    @property
    def conversational(self) -> bool:
        """The child was talking, not answering: asking to hear the question again, or saying something else.
        It is no try and no miss, and it shows they can be heard, so it does not count towards a child who
        cannot be."""
        return self.verdict == "unheard" and self.heard_kind == "conversation"

    @property
    def facts_right(self) -> frozenset[int]:
        if self.result is not None:
            return frozenset(self.result.get("correct_multipliers", ()))
        return self._single_fact() if self.decision == "correct" else frozenset()

    @property
    def facts_wrong(self) -> frozenset[int]:
        if self.result is not None:
            wrong = {
                fact["multiplier"] for fact in self.result.get("incorrect_facts", ())
            }
            wrong |= set(self.result.get("missing_multipliers", ()))
            return frozenset(wrong | set(self.result.get("uncertain_multipliers", ())))
        return frozenset() if self.decision == "correct" else self._single_fact()

    def _single_fact(self) -> frozenset[int]:
        exercise = self.exercise or {}
        multiplier = exercise.get("multiplier")
        if exercise.get("kind") != "fact_answer" or not isinstance(multiplier, int):
            return frozenset()
        return frozenset({multiplier})


def evidence_from_rows(
    rows: list[dict], plans: dict[str, LessonPlan]
) -> list[Evidence]:
    """Teacher notes and marked answers, oldest first. Only a turn that names the plan event it
    answered is lesson evidence; the Worker accepts that name only for a step the learner was
    given, so nothing else can earn progress."""
    items = []
    for row in rows:
        plan_id, event_id = row.get("plan_id"), row.get("event_id")
        if plan_id is None and row.get("metadata_json"):
            metadata = json.loads(row["metadata_json"])
            plan_id, event_id = metadata.get("plan_id"), metadata.get("event_id")
        plan = plans.get(plan_id)
        if plan is None or not any(event.id == event_id for event in plan.events):
            continue
        prompt_id = (
            json.loads(row["metadata_json"]).get("prompt_id")
            if row.get("metadata_json")
            else None
        )
        result = json.loads(row["result_json"]) if row.get("result_json") else None
        exercise = (
            json.loads(row["exercise_json"]) if row.get("exercise_json") else None
        )
        day = lesson_day(int(row["at"]))
        items.append(
            Evidence(
                plan_id,
                event_id,
                day,
                row.get("decision"),
                result,
                exercise,
                prompt_id,
                row.get("verdict"),
                row.get("heard_kind"),
            )
        )
    return items

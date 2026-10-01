"""What one answer of a child is evidence of, at full resolution.

The lesson log (tutoring turns and teacher notes) is the record. This reads it into one event per answer
with everything a model of what the child knows could want: which skills the answer speaks for, whether it
was right, how much help had been given and in what form, how much of the task was asked, how many tries
it was, what went wrong, and how well the recording was heard. Nothing here decides what a child knows or
what to do next; the lesson controller and a tracer each read these.
"""

from dataclasses import dataclass
from datetime import date

from .curriculum import (
    ECHO_PREFIX,
    PROBE_PREFIX,
    REMEDY_PREFIX,
    REPAIR_PREFIX,
    SHOW_PREFIX,
    LessonPlan,
)
from .evidence import Evidence
from .progress import where_it_broke

# How much help sat behind an answer, from none to the answer said for the child to repeat.
LEVEL_INDEPENDENT, LEVEL_PROBE, LEVEL_CUE, LEVEL_HINT, LEVEL_PARTIAL, LEVEL_TOLD = (
    range(6)
)


@dataclass(frozen=True)
class SkillUse:
    skill: str
    role: str  # "primary": what doing it well shows; "supporting": also needed


@dataclass(frozen=True)
class EvidenceEvent:
    plan_id: str
    event_id: str
    kind: str  # the lesson event: stimulate_recall, elicit_performance, assess_performance...
    day: date
    prompt_id: str | None
    skills: tuple[SkillUse, ...]
    outcome: str  # correct | wrong | dont_know | unheard
    independent: bool
    support_type: str  # none | probe | cue | hint | model
    support_level: int
    task_scope: str  # full | narrowed | single_step
    previous_help: bool
    attempt: int
    error_at: str | None  # the item a list broke at
    hearing: str  # heard | nothing | garbled | dont_know | conversation


def _skills(event) -> tuple[SkillUse, ...]:
    primary = [SkillUse(event.skill, "primary")] if event.skill else []
    return tuple(primary + [SkillUse(s, "supporting") for s in event.supporting_skills])


def _outcome(item: Evidence) -> str:
    if item.unheard:
        return "unheard"
    if item.verdict == "unheard" and item.heard_kind == "dont_know":
        return "dont_know"
    return "correct" if item.decision == "correct" else "wrong"


HINT_SUPPORT = {
    "cue": ("cue", LEVEL_CUE),
    "structure": ("hint", LEVEL_HINT),
    "partial_model": ("model", LEVEL_PARTIAL),
}


def _how_asked(event, item: Evidence, attempt: int) -> tuple[str, int, str]:
    """The kind of help behind the answer, its level, and how much of the task was asked."""
    prompt = item.prompt_id or ""
    if prompt.startswith(PROBE_PREFIX):
        return "probe", LEVEL_PROBE, "single_step"
    if prompt.startswith(REMEDY_PREFIX):
        return "model", LEVEL_PARTIAL, "single_step"
    if prompt.startswith((SHOW_PREFIX, ECHO_PREFIX)):
        return "model", LEVEL_TOLD, "single_step"
    if event.event == "provide_guidance":
        return "model", LEVEL_TOLD, "full"
    if prompt.startswith(REPAIR_PREFIX):
        return "hint", LEVEL_HINT, "narrowed"
    scope = "narrowed" if event.support is not None else "full"
    if attempt == 1:
        return (
            ("cue", LEVEL_CUE, scope)
            if event.support is not None
            else ("none", LEVEL_INDEPENDENT, scope)
        )
    levels = (
        event.activity.hint_levels if event.activity and event.activity.hints else ()
    )
    after_wrong = attempt - 1
    if after_wrong <= len(levels):
        support_type, level = HINT_SUPPORT[levels[after_wrong - 1]]
        return support_type, level, scope
    return "model", LEVEL_TOLD, scope


def evidence_events(
    evidence: list[Evidence], plans: dict[str, LessonPlan]
) -> list[EvidenceEvent]:
    """One event per answer, oldest first. A teacher note is not an answer; a recording nobody could hear is
    an event of outcome `unheard` and does not count as a try."""
    events: list[EvidenceEvent] = []
    tries: dict[tuple[str, str, date], int] = {}
    helped: set[tuple[str, str, date]] = set()
    for item in evidence:
        plan = plans.get(item.plan_id)
        if plan is None or item.decision is None:
            continue
        event = plan.event(item.event_id)
        key = (item.plan_id, item.event_id, item.day)
        side = (item.prompt_id or "").startswith(
            (PROBE_PREFIX, SHOW_PREFIX, ECHO_PREFIX, REMEDY_PREFIX)
        )
        noise = item.unheard
        attempt = tries.get(key, 0) + (0 if side or noise else 1)
        support_type, level, scope = _how_asked(event, item, attempt or 1)
        events.append(
            EvidenceEvent(
                plan_id=item.plan_id,
                event_id=item.event_id,
                kind=event.event,
                day=item.day,
                prompt_id=item.prompt_id,
                skills=_skills(event),
                outcome=_outcome(item),
                independent=level == LEVEL_INDEPENDENT,
                support_type=support_type,
                support_level=level,
                task_scope=scope,
                previous_help=key in helped,
                attempt=attempt or 1,
                error_at=where_it_broke(event, item.result),
                hearing="heard"
                if item.verdict != "unheard"
                else (item.heard_kind or "garbled"),
            )
        )
        if not side and not noise:
            tries[key] = attempt
        if (
            side
            or (item.decision != "correct" and not noise)
            or event.event == "provide_guidance"
        ):
            helped.add(key)
    return events

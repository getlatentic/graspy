"""How a step is asked and what may answer it: the move the app renders for a plan event, the steps asked another
way than the plan wrote them, and the prompt ids a recording may claim.
"""

import re

from .curriculum import (
    LANGUAGES,
    PROBE_PREFIX,
    SHOW_PREFIX,
    LessonEvent,
    LessonPlan,
    activity_prompt_id,
    echo_target,
    echo_utterance_id,
    echoable,
    item_step_target,
    load_skills,
    probe_utterance_id,
    remedy_steps,
    remedy_target,
    remedy_utterance_id,
    repair_target,
    repair_utterance_id,
    repairable,
    show_utterance_id,
)
from .exercises import MULTIPLIERS, fact_prompt_id
from .progress_state import PlanProgress
from .sequencing import Variant, left_for_tomorrow, plans_for_class
from .speech.teacher_audio_contract import fact_utterance_id, teacher_utterance


def event_move(
    plan: LessonPlan,
    event: LessonEvent,
    reason: str,
    facts: tuple[int, ...] = (),
    variant: Variant | None = None,
) -> dict:
    """What the app renders: the note to play, what to show, and the activity to record for."""
    activity = None
    if event.activity is not None:
        activity = {
            "kind": event.activity.kind,
            "prompt_id": activity_prompt_id(plan, event),
        }
        if event.activity.kind == "sequence" and event.event == "provide_guidance":
            items = event.activity.items
            activity["items"] = [
                {"id": item.id, "spoken": item.spoken[0]} for item in items
            ]
    return {
        "kind": "event",
        "plan_id": plan.id,
        "event_id": event.id,
        "event": event.event,
        "subject": plan.subject,
        "title": plan.title,
        "say": event.utterance_id(plan.id),
        "say_text": event.say,
        "show": event.show,
        "activity": activity,
        "reason": reason,
    } | (narrowed_retry(event, facts) or asked_another_way(plan, event, variant) or {})


REST_MOVE = {
    "kind": "rest",
    "say": "finished",
    "reason": "a lesson was finished today, or nothing is due",
}
CHECK_TOMORROW_MOVE = {
    "kind": "rest",
    "say": "check-tomorrow",
    "reason": "the check was passed only with help, so it is asked again tomorrow",
}
TOMORROW_MOVE = {
    "kind": "rest",
    "say": "try-tomorrow",
    "reason": "an activity was failed three times today, so the lesson is left for tomorrow",
}


def rest_move(
    plans: dict[str, LessonPlan],
    progress: dict[str, PlanProgress],
    learner_class: str | None,
) -> dict:
    """The step when nothing more is offered today: a kind word about tomorrow, or that all is done."""
    if not left_for_tomorrow(plans, progress, learner_class):
        return REST_MOVE
    helped = any(
        progress[plan.id].supported_today
        for plan in plans_for_class(plans, learner_class)
    )
    return CHECK_TOMORROW_MOVE if helped else TOMORROW_MOVE


RECITED_TABLE = re.compile(r"mul_table_(\d+)_recite_.*")


def answerable_prompts(plan: LessonPlan, event: LessonEvent) -> set[str]:
    """The prompt ids a recording may claim for this event.

    A recited table may also be answered one fact at a time, because that is how the teacher asks
    for the facts a partial recitation missed. Nothing else is accepted, so progress on an event
    can only be made by doing what that event asks.
    """
    prompts = {activity_prompt_id(plan, event)}
    activity = event.activity
    if echoable(event):
        prompts.add(echo_utterance_id(plan.id, event.id))
        for at in range(len(remedy_steps(event, load_skills()))):
            prompts.add(remedy_utterance_id(plan.id, event.id, at))
    if repairable(event):
        ids = [item.id for item in activity.items]
        for make in (repair_utterance_id, probe_utterance_id, show_utterance_id):
            prompts |= {make(plan.id, event.id, item_id) for item_id in ids[1:]}
    if activity is None or activity.kind != "existing":
        return prompts
    match = RECITED_TABLE.fullmatch(activity.prompt_id)
    if match is None:
        return prompts
    return prompts | {fact_prompt_id(int(match[1]), m, "answer") for m in MULTIPLIERS}


def narrowed_retry(event: LessonEvent, facts: tuple[int, ...]) -> dict | None:
    """One owed fact asked on its own, in place of reciting the whole table again.

    A child who said nine of twelve facts should not have to say all twelve to fix three: the long
    recitation is also what speech recognition handles worst, so the misses are asked one at a time.
    """
    activity = event.activity
    if not facts or activity is None or activity.kind != "existing":
        return None
    match = RECITED_TABLE.fullmatch(activity.prompt_id)
    if match is None:
        return None
    table, multiplier = int(match[1]), facts[0]
    utterance = fact_utterance_id(table, multiplier, "ask")
    return {
        "say": utterance,
        "say_text": {
            lang: teacher_utterance(utterance, lang).text for lang in LANGUAGES
        },
        "activity": {
            "kind": "existing",
            "prompt_id": fact_prompt_id(table, multiplier, "answer"),
        },
    }


def _another_way(plan: LessonPlan, utterance: str, kind: str) -> dict:
    """A step asked in a way the plan did not write: the line to say, in every language, and what it asks for."""
    return {
        "say": utterance,
        "say_text": {
            lang: teacher_utterance(utterance, lang).text for lang in LANGUAGES
        },
        "activity": {"kind": kind, "prompt_id": utterance},
    }


def asked_another_way(
    plan: LessonPlan, event: LessonEvent, variant: Variant | None
) -> dict | None:
    """The step as the variant asks it, or None when the plans do not have what the variant names."""
    if variant is None:
        return None
    how, item = variant
    if how == "echo":
        utterance = echo_utterance_id(plan.id, event.id)
        found = echo_target(utterance, {plan.id: plan})
        return _another_way(plan, utterance, event.activity.kind) if found else None
    if how == "remedy":
        utterance = remedy_utterance_id(plan.id, event.id, int(item))
        found = remedy_target(utterance, {plan.id: plan}, load_skills())
        return _another_way(plan, utterance, "answer") if found else None
    makers = {
        "repair": (repair_utterance_id, "sequence", None),
        "probe": (probe_utterance_id, "answer", PROBE_PREFIX),
        "show": (show_utterance_id, "answer", SHOW_PREFIX),
    }
    if how not in makers:
        return None
    make, kind, prefix = makers[how]
    utterance = make(plan.id, event.id, item)
    found = (
        repair_target(utterance, {plan.id: plan})
        if prefix is None
        else item_step_target(utterance, prefix, {plan.id: plan})
    )
    return _another_way(plan, utterance, kind) if found else None

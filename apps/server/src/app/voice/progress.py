"""What a learner's evidence says about each lesson plan: what is owed, what is done, and what leaves the lesson
for tomorrow. The evidence is folded oldest first.
"""

from datetime import date

from .curriculum import REPAIR_PREFIX, LessonEvent, LessonPlan, repairable
from .evidence import Evidence
from .progress_state import PAUSE_AFTER, PAUSING_EVENTS, RETEACH_EVENTS, PlanProgress
from .side_steps import (
    is_side_step,
    record_recall,
    record_side_step,
    record_unheard,
)


def _served_first(plan: LessonPlan, owed: set[str]) -> set[str]:
    """The teacher answers one miss at a time, in plan order; that one is no longer owed."""
    for event in plan.events:
        if event.id in owed:
            return {event.id}
    return set()


def _hints_in(event: LessonEvent) -> int:
    """How many cues and hints the plan gives a wrong answer before the answer is told."""
    return len(event.activity.hints) if event.activity else 0


def _owe_help(
    state: PlanProgress,
    plan: LessonPlan,
    event: LessonEvent,
    decision: str,
    misses: int,
    broke_at: str | None,
) -> None:
    """What the child hears before trying again. One who did not know, or who has missed twice running, is
    shown it once more in the plan's guided practice; one who missed twice with a shorter step in the plan
    is given that step. The teacher's own reply already speaks of what this child got wrong, so the plan's
    general feedback line, written about one example, is never played. A recall check is asked again
    without help: one missed twice is not asked again, and the teaching that follows is the help."""
    if event.event == "stimulate_recall":
        return
    can_reteach = event.event in RETEACH_EVENTS and any(
        other.event == "provide_guidance" for other in plan.events
    )
    # The plan's hints come first: each is a miss answered with a cue, and the answer is told after them.
    help_after = 2 + _hints_in(event)
    if misses >= help_after and rung_of(plan, event) is not None:
        state.rung_owed.add(event.id)
    elif (
        event.event == "assess_performance"
        and misses >= help_after
        and broke_at is not None
        and (practice := _practice_of(plan, event))
    ):
        # A list that came right up to a point is practised again from there, not from its start.
        state.resume_at[practice.id] = broke_at
        state.retry_today.add(practice.id)
    elif can_reteach and (decision == "not_understood" or misses >= help_after):
        state.guidance_owed.add(event.id)


def rung_of(plan: LessonPlan, event: LessonEvent) -> LessonEvent | None:
    """The shorter step the plan gives towards this event, if it gives one."""
    return next((other for other in plan.events if other.support == event.id), None)


def _repaired_past_the_break(
    event: LessonEvent, item: Evidence, state: PlanProgress
) -> bool:
    """Whether an answer claims a repair that starts later than the child's try broke.

    Saying only the last item of a list is not doing what the step asked, so it earns nothing."""
    if not item.prompt_id or not item.prompt_id.startswith(REPAIR_PREFIX):
        return False
    claimed = item.prompt_id.rpartition(".")[2]
    broke_at = state.resume_at.get(item.event_id)
    ids = [one.id for one in (event.activity.items if event.activity else ())]
    return (
        broke_at is None
        or claimed not in ids
        or ids.index(claimed) > ids.index(broke_at)
    )


def _got_further(
    event: LessonEvent, before: str | None, now: str | None, missed_before: bool
) -> bool:
    """Whether a wrong try of a list got past where the one before it broke: some progress, not a repeat.

    A try that had nothing right and is followed by one that has something is progress too."""
    if now is None or event.activity is None:
        return False
    if before is None:
        return missed_before
    ids = [item.id for item in event.activity.items]
    return ids.index(now) > ids.index(before)


def _record_supported_pass(state: PlanProgress, item: Evidence, today: date) -> None:
    """The check was passed after the teacher helped, so it shows the child can do it with help, not alone.
    The lesson is not complete and not learnt: it is left for today, to be checked again tomorrow."""
    state.supported_days.add(item.day)
    if item.day == today:
        state.supported_today = True
        state.paused_today = True


def support_of(event: LessonEvent, item: Evidence, attempt: int) -> str:
    """How much help produced an answer, which says what it shows.

    An answer said after the teacher, to a shorter step, or to a list asked again from where it broke,
    or on a later try, shows that the child can do it with help. Only a first try at the plan's own
    question shows that they can do it alone."""
    if event.event == "provide_guidance":
        return "modelled"
    if item.prompt_id and item.prompt_id.startswith(REPAIR_PREFIX):
        return "narrowed"
    if event.support is not None:
        return "reduced"
    return "independent" if attempt == 1 else "after_help"


def list_break(event: LessonEvent, result: dict | None) -> str | None:
    """The first item of a list a try left out or said out of place, when something came right before it.

    A child who said eleven of twelve numbers rightly needs the twelfth, not the list again; one who
    got nothing right has no start to carry on from."""
    if event.activity is None or event.activity.kind != "sequence" or not result:
        return None
    broken = set(result.get("missing", ())) | set(result.get("out_of_order", ()))
    ids = [item.id for item in event.activity.items]
    at = next((n for n, item_id in enumerate(ids) if item_id in broken), None)
    return ids[at] if at else None


def where_it_broke(event: LessonEvent, result: dict | None) -> str | None:
    """Where a try at the child's own list broke, for the steps that ask for it again from there."""
    return list_break(event, result) if repairable(event) else None


def _practice_of(plan: LessonPlan, event: LessonEvent) -> LessonEvent | None:
    """The child's own try at the same list as a check of it, which can be asked again from a break."""
    if event.activity is None or event.activity.kind != "sequence":
        return None
    items = [item.id for item in event.activity.items]
    return next(
        (
            other
            for other in plan.events
            if other.id != event.id
            and repairable(other)
            and [item.id for item in other.activity.items] == items
        ),
        None,
    )


def _serve_owed_help(state: PlanProgress, plan: LessonPlan, event: LessonEvent) -> None:
    """The plan's feedback or guided practice, once said, is no longer owed for the first miss in plan order."""
    if event.event == "provide_guidance":
        state.guidance_owed -= _served_first(plan, state.guidance_owed)


def _record_attempt(
    state: PlanProgress,
    plan: LessonPlan,
    event: LessonEvent,
    item: Evidence,
    streaks: dict[tuple[str, str, date], int],
    today: date,
) -> None:
    """One marked turn: what is owed to the child, and whether the lesson is left for tomorrow."""
    key = (item.plan_id, item.event_id, item.day)
    streaks[(item.plan_id, f"{item.event_id}#unheard", item.day)] = 0
    broke_at = where_it_broke(event, item.result)
    if (
        item.decision == "correct"
        or item.facts_right
        or _got_further(
            event,
            state.resume_at.get(item.event_id),
            broke_at,
            streaks.get(key, 0) > 0,
        )
    ):
        streaks[key] = 0
    else:
        streaks[key] = streaks.get(key, 0) + 1
    misses = streaks[key]
    if event.event in PAUSING_EVENTS and misses >= PAUSE_AFTER + _hints_in(event):
        state.paused_days.add(item.day)
        state.paused_today = state.paused_today or item.day == today
    if event.event == "stimulate_recall":
        record_recall(state, event, item, streaks, today)
    if item.day != today:
        return
    state.failed_today[item.event_id] = misses
    if item.decision == "correct":
        state.retry_today.discard(item.event_id)
        state.resume_at.pop(item.event_id, None)
        state.probed.pop(item.event_id, None)
        state.probe_right.pop(item.event_id, None)
        state.shown.pop(item.event_id, None)
        return
    if broke_at is not None:
        state.resume_at[item.event_id] = broke_at
    state.done_today.discard(item.event_id)
    state.retry_today.add(item.event_id)
    _owe_help(state, plan, event, item.decision, misses, list_break(event, item.result))


def progress_by_plan(
    evidence: list[Evidence], plans: dict[str, LessonPlan], today: date
) -> dict[str, PlanProgress]:
    progress = {plan_id: PlanProgress() for plan_id in plans}
    streaks: dict[tuple[str, str, date], int] = {}
    attempts: dict[tuple[str, str, date], int] = {}
    for item in evidence:
        if item.plan_id not in plans:
            continue
        state, plan = progress[item.plan_id], plans[item.plan_id]
        event = plan.event(item.event_id)
        if _repaired_past_the_break(event, item, state):
            continue
        if is_side_step(item):
            record_side_step(state, event, item, streaks, today)
            continue
        state.last_day = (
            item.day if state.last_day is None else max(state.last_day, item.day)
        )
        if item.day == today:
            state.done_today.add(item.event_id)
            _serve_owed_help(state, plan, event)
        if item.decision is None:
            continue
        if item.unheard:
            record_unheard(state, item, streaks, today)
            continue
        state.last_decision[item.event_id] = item.decision
        if event.support is not None and item.day == today:
            # Answered, not just heard: how it went decides what comes next.
            state.rung_owed.discard(event.support)
        if item.day == today:
            owed = state.facts_owed.get(item.event_id, frozenset())
            state.facts_owed[item.event_id] = (
                owed | item.facts_wrong
            ) - item.facts_right
        tries = attempts[(item.plan_id, item.event_id, item.day)] = (
            attempts.get((item.plan_id, item.event_id, item.day), 0) + 1
        )
        if event.event == "assess_performance" and item.decision == "correct":
            if support_of(event, item, tries) == "independent":
                state.assessed_days.add(item.day)
                state.independent_days.add(item.day)
                state.assessed_today = state.assessed_today or item.day == today
            elif state.assessed_days:
                # A review of a lesson learnt before, passed with help: it is still a review passed, and the
                # memory is told it took help, so it comes round sooner.
                state.assessed_days.add(item.day)
                state.assessed_today = state.assessed_today or item.day == today
            else:
                _record_supported_pass(state, item, today)
        _record_attempt(state, plan, event, item, streaks, today)
    return progress

"""Which plan event comes next: the steps the code allows, offered to the teacher to choose from."""

from dataclasses import dataclass
from datetime import date

from .curriculum import LessonEvent, LessonPlan, load_skills, probeable, remedy_steps
from .evidence import Evidence
from .progress import rung_of
from .progress_state import PAUSED_DAYS_LIMIT, RECALL_ATTEMPTS, PlanProgress
from .side_steps import echo_owed

# How a step is asked when it is not the plan's own line: a list asked again from where it broke ("repair"),
# the item it broke at asked for ("probe") or said after the teacher ("show"), or the check's answer said
# after the teacher ("echo"). The second part is the item the list broke at, empty for an echo.
Variant = tuple[str, str]


@dataclass(frozen=True)
class Option:
    plan_id: str
    event_id: str
    why: str
    facts: tuple[int, ...] = ()
    variant: Variant | None = None

    @property
    def resume(self) -> str | None:
        return self.variant[1] if self.variant and self.variant[0] == "repair" else None

    @property
    def echo(self) -> bool:
        return bool(self.variant and self.variant[0] == "echo")


def plans_for_class(
    plans: dict[str, LessonPlan], learner_class: str | None
) -> list[LessonPlan]:
    if learner_class is None:
        return list(plans.values())
    return [plan for plan in plans.values() if learner_class in plan.classes]


def next_new_plan(
    plans: dict[str, LessonPlan],
    progress: dict[str, PlanProgress],
    learner_class: str | None,
):
    """The first plan of the class never yet assessed whose prerequisites of the same class have
    each been assessed once, a lesson left for an earlier day first. A prerequisite belonging only to
    an earlier class was taught there and is taken as known. Mastery (two days) governs reviews, not
    what may be started. A lesson left for tomorrow on PAUSED_DAYS_LIMIT days comes after the others."""
    offered = {plan.id for plan in plans_for_class(plans, learner_class)}
    ready, stuck = [], []
    for plan in plans_for_class(plans, learner_class):
        state = progress[plan.id]
        if state.assessed_days or state.paused_today or state.supported_days:
            continue
        needed = [p for p in plan.prerequisites if p in offered]
        if not all(progress[prerequisite].unlocks for prerequisite in needed):
            continue
        (stuck if len(state.paused_days) >= PAUSED_DAYS_LIMIT else ready).append(plan)
    # A lesson left for tomorrow is taken up first: the child was told it would be.
    first = next((plan for plan in ready if progress[plan.id].paused_days), None)
    return first or next(iter(ready or stuck), None)


def due_reviews(
    plans: dict[str, LessonPlan],
    progress: dict[str, PlanProgress],
    today: date,
    learner_class: str | None = None,
    weakened: tuple[str, ...] = (),
) -> list[LessonPlan]:
    """Plans of this learner's class whose recall has slipped, weakest first.

    Weakness is the memory model's judgement, made from how every assessment of the lesson actually
    went. This keeps the two facts the model does not hold: which lessons belong to the learner's
    class, and that a lesson already assessed today is not asked for again.
    """
    own = {plan.id for plan in plans_for_class(plans, learner_class)}
    return [
        plans[plan_id]
        for plan_id in weakened
        if plan_id in own
        and today not in progress[plan_id].assessed_days
        and not progress[plan_id].paused_today
    ]


def next_event_in(plan: LessonPlan, state: PlanProgress) -> LessonEvent | None:
    """The first event not done today. An activity that failed today first gives the child help, the
    plan's feedback or its guided practice again (see _owe_help), then comes round again. A recall
    check failed twice is left for the teaching that follows, unless the child showed nothing of it: then its
    answer is said after the teacher and it is asked once more (see record_recall). A plan whose activity
    was failed three times is left for tomorrow. Once the child has passed the check today, only what follows
    it is left: a review passed first is not followed by the whole lesson. None when the plan is
    complete or paused for today."""
    if state.paused_today and not state.assessed_today:
        return None
    events = plan.events
    if state.assessed_today:
        check = next(
            at for at, e in enumerate(events) if e.event == "assess_performance"
        )
        events = events[check + 1 :]
        if state.reviewed_today:
            events = [e for e in events if e.event != "enhance_retention"]
    for event in events:
        # The plan's feedback is for a miss: it comes from the owed help below, never as the next step in order.
        if event.event == "provide_feedback":
            continue
        # A shorter step is asked only while it is owed or being tried again.
        if event.support is not None and event.id not in state.retry_today:
            continue
        if event.event == "stimulate_recall":
            if event.id in state.recheck_due or echo_owed(state, event):
                return event
            if state.failed_today.get(event.id, 0) >= RECALL_ATTEMPTS:
                continue
        owed = state.facts_owed.get(event.id) or frozenset()
        if event.id in state.retry_today or owed:
            if event.id in state.guidance_owed:
                return plan.event_of("provide_guidance")
            if event.id in state.rung_owed:
                return rung_of(plan, event)
            return event
        if event.id not in state.done_today:
            return event
    return None


def _step(
    plan: LessonPlan, event: LessonEvent, why: str, state: PlanProgress
) -> Option:
    """One step of a lesson as it is offered now: with what is owed on it, and how it is asked."""
    owed = state.facts_owed.get(event.id) or frozenset()
    return Option(plan.id, event.id, why, tuple(sorted(owed)), _variant(state, event))


def _variant(state: PlanProgress, event: LessonEvent) -> Variant | None:
    """How the step is asked now. A check the child showed nothing of is answered for them first. A list
    that broke is repaired least help first: the item it broke at is asked for, then said for them if they
    could not give it, and only then is the list asked again from the last item they had right."""
    if echo_owed(state, event):
        if remedy_steps(event, load_skills()):
            return ("remedy", str(state.remedy_done.get(event.id, 0)))
        return ("echo", "")
    broke_at = state.resume_at.get(event.id) if event.id in state.retry_today else None
    if broke_at is None:
        return None
    if probeable(event) and state.probed.get(event.id) != broke_at:
        return ("probe", broke_at)
    if not state.probe_right.get(event.id) and state.shown.get(event.id) != broke_at:
        return ("show", broke_at)
    return ("repair", broke_at)


def next_options(
    plans: dict[str, LessonPlan],
    progress: dict[str, PlanProgress],
    today: date,
    learner_class: str | None,
    evidence: list[Evidence] = (),
    chosen: str | None = None,
    weakened: tuple[str, ...] = (),
) -> list[Option]:
    """One to three legal next steps: finish the lesson touched last today, else a due review
    and the next new plan. A lesson the learner opened themselves is the only step offered.
    Nothing is offered once a lesson has been left for tomorrow or learnt today: a lesson ends by
    telling the child what comes tomorrow, so the day is over. A review ends without that line, so
    it is followed by the next review or new lesson."""
    if left_for_tomorrow(plans, progress, learner_class):
        return []
    if chosen is not None:
        return _chosen_options(plans, progress, today, learner_class, chosen)
    own = {plan.id for plan in plans_for_class(plans, learner_class)}
    latest_today = next(
        (
            item
            for item in reversed(evidence)
            if item.day == today and item.plan_id in own
        ),
        None,
    )
    if latest_today is not None:
        plan = plans[latest_today.plan_id]
        event = next_event_in(plan, progress[plan.id])
        if event is not None:
            why = f"continue {plan.title['en']} at {event.event}"
            return [_step(plan, event, why, progress[plan.id])]
        if not progress[plan.id].reviewed_today:
            return []
    owed = [
        plan
        for plan in plans_for_class(plans, learner_class)
        if progress[plan.id].owes_a_check
        and not progress[plan.id].paused_today
        and not progress[plan.id].supported_today
    ]
    if owed:
        # A lesson passed only with help is checked again before anything else: nothing new is added to it.
        check = owed[0]
        return [
            Option(
                check.id,
                check.event_of("assess_performance").id,
                f"check {check.title['en']} again, alone",
            )
        ]
    options: list[Option] = []
    for plan in due_reviews(plans, progress, today, learner_class, weakened)[:2]:
        review = plan.event_of("assess_performance")
        options.append(
            Option(plan.id, review.id, f"review {plan.title['en']} before new work")
        )
    fresh = next_new_plan(plans, progress, learner_class)
    if fresh is not None:
        options.append(
            Option(fresh.id, fresh.events[0].id, f"start {fresh.title['en']}")
        )
    return options


def _chosen_options(plans, progress, today, learner_class, chosen: str) -> list[Option]:
    """The next step of the lesson the learner opened.

    Any lesson of their own class may be opened; the teacher still decides which step of it comes
    next, so opening one says which lesson to work on, never that a step was earned.
    """
    if chosen not in {plan.id for plan in plans_for_class(plans, learner_class)}:
        return []
    plan = plans[chosen]
    event = next_event_in(plan, progress[plan.id])
    if event is None:
        return []
    why = f"open {plan.title['en']} at {event.event}"
    return [_step(plan, event, why, progress[plan.id])]


def left_for_tomorrow(
    plans: dict[str, LessonPlan],
    progress: dict[str, PlanProgress],
    learner_class: str | None,
) -> bool:
    """Whether a lesson of the learner's class was paused today after the child could not do it."""
    return any(
        progress[plan.id].paused_today and not progress[plan.id].assessed_today
        for plan in plans_for_class(plans, learner_class)
    )

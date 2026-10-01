"""The teacher: which plan event comes next, chosen from the steps the code allows.

Evidence is what the learner did (marked turns) and what the teacher already said (events).
Code turns that into one to three legal next steps; the model on Workers AI picks one by number
and says why. Marking never passes through the model, and it can only pick a step it was offered.
"""

import asyncio
import json
import re
from dataclasses import dataclass, field
from datetime import date

from .curriculum import (
    ECHO_PREFIX,
    LANGUAGES,
    PROBE_PREFIX,
    REPAIR_PREFIX,
    SHOW_PREFIX,
    LessonEvent,
    LessonPlan,
    activity_prompt_id,
    echo_target,
    echo_utterance_id,
    echoable,
    item_step_target,
    probe_utterance_id,
    probeable,
    repair_target,
    repair_utterance_id,
    repairable,
    show_utterance_id,
)
from .exercises import MULTIPLIERS, fact_prompt_id
from .lesson_store import lesson_day
from .speech.teacher_audio_contract import fact_utterance_id, teacher_utterance

MODEL = "@cf/openai/gpt-oss-120b"
DECISION_TIMEOUT_SECONDS = 20
MASTERY_DAYS = 2
# A check of what the child already knows is asked this many times a day. A child who tried and got some of it
# is taught next; one who showed nothing of it is given the answer to say after the teacher, and asked once more.
RECALL_ATTEMPTS = 2
# An activity the child could not begin to do this many times running in a day is left for tomorrow: a child who
# has been shown, and shown again, and still cannot do it is not helped by a fourth try.
PAUSE_AFTER = 3
# What the child is asked to do alone, or to say after the teacher: any of these can leave the lesson for tomorrow.
PAUSING_EVENTS = ("elicit_performance", "assess_performance", "provide_guidance")
# The activities that are shown again, in the plan's guided practice, after a miss.
RETEACH_EVENTS = ("elicit_performance", "assess_performance")
# A lesson left for tomorrow on this many days comes after the other lessons that can be started, so the child is not
# sent back to the same failure first; when there is nothing else, it is offered again.
PAUSED_DAYS_LIMIT = 3


class TeacherChoiceError(RuntimeError):
    """The model chose a step the code did not offer, or answered in the wrong shape."""


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


@dataclass(frozen=True)
class Choice:
    plan_id: str
    event_id: str
    reason: str
    facts: tuple[int, ...] = ()
    variant: Variant | None = None

    @property
    def resume(self) -> str | None:
        return self.variant[1] if self.variant and self.variant[0] == "repair" else None

    @property
    def echo(self) -> bool:
        return bool(self.variant and self.variant[0] == "echo")


@dataclass
class PlanProgress:
    done_today: set[str] = field(default_factory=set)
    retry_today: set[str] = field(default_factory=set)
    guidance_owed: set[str] = field(default_factory=set)
    # Events missed twice running that a shorter step of the plan is owed before they are asked again.
    rung_owed: set[str] = field(default_factory=set)
    # Per list activity, the item its last wrong try broke at, after at least one item said rightly.
    resume_at: dict[str, str] = field(default_factory=dict)
    # Per check of what the lesson builds on, how many tries in a row drew nothing right from the child.
    blank_recall: dict[str, int] = field(default_factory=dict)
    # The checks whose answer was said after the teacher, and those asked again since and not yet answered.
    echoed: set[str] = field(default_factory=set)
    recheck_due: set[str] = field(default_factory=set)
    rechecked: set[str] = field(default_factory=set)
    # Per list activity, the item the child was last asked for before being told it ("probed"), whether they
    # had it, and the item that was then said for them to say after the teacher ("shown").
    probed: dict[str, str] = field(default_factory=dict)
    probe_right: dict[str, bool] = field(default_factory=dict)
    shown: dict[str, str] = field(default_factory=dict)
    # Misses in a row today per activity, counted while the child makes no progress: a wrong answer with
    # some facts right, or a right answer, starts the count again.
    failed_today: dict[str, int] = field(default_factory=dict)
    paused_today: bool = False
    assessed_today: bool = False
    paused_days: set[date] = field(default_factory=set)
    last_decision: dict[str, str] = field(default_factory=dict)
    facts_owed: dict[str, frozenset[int]] = field(default_factory=dict)
    assessed_days: set[date] = field(default_factory=set)
    # The days the check was passed at the first try, with no help: the only days that show a lesson is known.
    independent_days: set[date] = field(default_factory=set)
    last_day: date | None = None

    @property
    def mastered(self) -> bool:
        return len(self.independent_days) >= MASTERY_DAYS

    @property
    def reviewed_today(self) -> bool:
        """Assessed today a lesson that was assessed on an earlier day too."""
        return self.assessed_today and len(self.assessed_days) >= 2


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
    if misses >= help_after and _rung_of(plan, event) is not None:
        state.rung_owed.add(event.id)
    elif can_reteach and (decision == "not_understood" or misses >= help_after):
        state.guidance_owed.add(event.id)


def _rung_of(plan: LessonPlan, event: LessonEvent) -> LessonEvent | None:
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


# A child who cannot be heard this many times running is sent home kindly, not marked wrong.
UNHEARD_LIMIT = 4


def _record_unheard(
    state: PlanProgress,
    item: Evidence,
    streaks: dict[tuple[str, str, date], int],
    today: date,
) -> None:
    """A recording that could not be marked: the step is asked again, and nothing is held against the child.

    It is no miss, it owes no feedback, and it is not a try. Only a child who cannot be heard again and
    again leaves the lesson for tomorrow, since the lesson cannot go on without hearing them."""
    key = (item.plan_id, f"{item.event_id}#unheard", item.day)
    streaks[key] = streaks.get(key, 0) + 1
    if item.day != today:
        return
    state.done_today.discard(item.event_id)
    state.retry_today.add(item.event_id)
    if streaks[key] >= UNHEARD_LIMIT:
        state.paused_days.add(item.day)
        state.paused_today = True


def _showed_nothing(item: Evidence) -> bool:
    """Whether a try drew nothing right from the child: not knowing and a wrong answer are the same
    evidence that the skill is not there. A recording nobody could hear is not a try, and never gets here."""
    return (
        item.decision != "correct"
        and not item.facts_right
        and not (item.result or {}).get("said")
    )


def _is_side_step(item: Evidence) -> bool:
    return bool(item.prompt_id) and item.prompt_id.startswith(
        (ECHO_PREFIX, PROBE_PREFIX, SHOW_PREFIX)
    )


def _record_side_step(
    state: PlanProgress,
    event: LessonEvent,
    item: Evidence,
    streaks: dict[tuple[str, str, date], int],
    today: date,
) -> None:
    """An answer to a question asked on the way back to the plan's own. It earns nothing towards the event,
    changes nothing about it (it is not done, not owed, not a try), and only says how the way back is going.
    One that names a break the child's list did not have is ignored: it was claimed, not asked."""
    if item.day != today or item.decision is None:
        return
    prompt = item.prompt_id
    broke_at = prompt.rpartition(".")[2]
    if not prompt.startswith(ECHO_PREFIX) and broke_at != state.resume_at.get(
        item.event_id
    ):
        return
    if item.unheard:
        key = (item.plan_id, f"{item.event_id}#unheard", item.day)
        streaks[key] = streaks.get(key, 0) + 1
        if streaks[key] >= UNHEARD_LIMIT:
            state.paused_days.add(item.day)
            state.paused_today = True
        return
    streaks[(item.plan_id, f"{item.event_id}#unheard", item.day)] = 0
    if prompt.startswith(ECHO_PREFIX):
        _record_echo(state, item, today)
    elif prompt.startswith(PROBE_PREFIX):
        state.probed[item.event_id] = broke_at
        state.probe_right[item.event_id] = item.decision == "correct"
    else:
        state.shown[item.event_id] = broke_at


def _record_echo(state: PlanProgress, item: Evidence, today: date) -> None:
    """The check's answer was said after the teacher: it is asked again, to see what that did."""
    if (
        item.day == today
        and item.decision is not None
        and item.event_id not in state.rechecked
    ):
        state.echoed.add(item.event_id)
        state.recheck_due.add(item.event_id)


def _record_recall(
    state: PlanProgress,
    event: LessonEvent,
    item: Evidence,
    streaks: dict[tuple[str, str, date], int],
    today: date,
) -> None:
    """What a try at the check of what the lesson builds on says about that skill.

    Nothing right twice running owes the child the answer said after the teacher. A try after that
    which still draws nothing leaves the lesson for tomorrow: the child is not taught on top of a
    skill they do not have, and is not sent away with a failure either."""
    key = (item.plan_id, f"{item.event_id}#blank", item.day)
    blank = _showed_nothing(item)
    streaks[key] = streaks.get(key, 0) + 1 if blank else 0
    if item.day != today:
        return
    state.blank_recall[item.event_id] = streaks[key]
    if item.event_id in state.recheck_due:
        state.recheck_due.discard(item.event_id)
        state.rechecked.add(item.event_id)
        if blank:
            state.paused_days.add(item.day)
            state.paused_today = True


def _echo_owed(state: PlanProgress, event: LessonEvent) -> bool:
    return (
        echoable(event)
        and state.blank_recall.get(event.id, 0) >= RECALL_ATTEMPTS
        and event.id not in state.echoed
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


def _broke_at(event: LessonEvent, result: dict | None) -> str | None:
    """The first item of a list a try left out or said out of place, when something came right before it.

    A child who said eleven of twelve numbers rightly needs the twelfth, not the list again; one who
    got nothing right has no start to carry on from."""
    if not repairable(event) or not result:
        return None
    broken = set(result.get("missing", ())) | set(result.get("out_of_order", ()))
    ids = [item.id for item in event.activity.items]
    at = next((n for n, item_id in enumerate(ids) if item_id in broken), None)
    return ids[at] if at else None


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
    broke_at = _broke_at(event, item.result)
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
        _record_recall(state, event, item, streaks, today)
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
    _owe_help(state, plan, event, item.decision, misses)


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
        if _is_side_step(item):
            _record_side_step(state, event, item, streaks, today)
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
            _record_unheard(state, item, streaks, today)
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
            state.assessed_days.add(item.day)
            state.assessed_today = state.assessed_today or item.day == today
            if support_of(event, item, tries) == "independent":
                state.independent_days.add(item.day)
        _record_attempt(state, plan, event, item, streaks, today)
    return progress


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
        if state.assessed_days or state.paused_today:
            continue
        needed = [p for p in plan.prerequisites if p in offered]
        if not all(progress[prerequisite].assessed_days for prerequisite in needed):
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
    answer is said after the teacher and it is asked once more (see _record_recall). A plan whose activity
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
            if event.id in state.recheck_due or _echo_owed(state, event):
                return event
            if state.failed_today.get(event.id, 0) >= RECALL_ATTEMPTS:
                continue
        owed = state.facts_owed.get(event.id) or frozenset()
        if event.id in state.retry_today or owed:
            if event.id in state.guidance_owed:
                return plan.event_of("provide_guidance")
            if event.id in state.rung_owed:
                return _rung_of(plan, event)
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
    if _echo_owed(state, event):
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


def decision_schema(options: list[Option]) -> dict:
    """The only answer shape the teacher may give: one numbered step, and why."""
    return {
        "type": "object",
        "properties": {
            "step": {"type": "integer", "minimum": 1, "maximum": len(options)},
            "reason": {"type": "string"},
        },
        "required": ["step", "reason"],
    }


def decision_prompt(
    options: list[Option], evidence: list[Evidence], today: date, language: str
) -> str:
    """Everything the teacher may consider, and the numbered steps it may pick from."""
    recent = [
        f"{item.day.isoformat()} {item.plan_id} {item.event_id} {item.decision or 'said'}"
        for item in evidence[-12:]
    ]
    offered = [
        f"{number}. {option.why}" for number, option in enumerate(options, start=1)
    ]
    return (
        "You are Aunty Chioma, a patient primary-school teacher in Nigeria, teaching in "
        f"{language}. Today is {today.isoformat()}. Choose the number of the step to take next. "
        "Prefer reviewing something learnt on an earlier day before starting new material.\n\n"
        "What this learner has done, oldest first:\n"
        + ("\n".join(recent) or "(nothing yet)")
        + "\n\n"
        "Steps:\n" + "\n".join(offered) + "\n\n"
        'Answer with JSON: {"step": <number>, "reason": "<one short sentence>"}'
    )


def _answer(reply: dict) -> dict:
    """The JSON object the model was told to produce, from Workers AI's chat reply."""
    choices = reply.get("choices") if isinstance(reply, dict) else None
    content = choices[0]["message"]["content"] if choices else None
    try:
        return json.loads(content) if isinstance(content, str) else content
    except (ValueError, KeyError, IndexError, TypeError) as error:
        raise TeacherChoiceError("the teacher model returned no decision") from error


def parse_choice(reply: dict, options: list[Option]) -> Choice:
    """Any answer that is not one of the numbered steps, in the expected shape, is refused."""
    answer = _answer(reply)
    if not isinstance(answer, dict):
        raise TeacherChoiceError("the teacher model returned no decision")
    step = answer.get("step")
    if not isinstance(step, int) or not 1 <= step <= len(options):
        raise TeacherChoiceError("the teacher model chose a step that was not offered")
    reason = answer.get("reason")
    chosen = options[step - 1]
    return Choice(
        chosen.plan_id,
        chosen.event_id,
        reason.strip() if isinstance(reason, str) else chosen.why,
        chosen.facts,
        chosen.variant,
    )


async def choose(
    client, options: list[Option], evidence: list[Evidence], today: date, language: str
) -> Choice:
    """A single offered step needs no model; several do."""
    if not options:
        raise TeacherChoiceError("no step can be offered to this learner")
    if len(options) == 1:
        first = options[0]
        return Choice(
            first.plan_id,
            first.event_id,
            first.why,
            first.facts,
            first.variant,
        )
    prompt = decision_prompt(options, evidence, today, language)
    return parse_choice(await client.decide(prompt, decision_schema(options)), options)


class TeacherModel:
    """The teacher's choice runs on Workers AI, beside the recognizer, with no key of its own."""

    def __init__(self, ai):
        self.ai = ai

    async def decide(self, prompt: str, schema: dict) -> dict:
        if self.ai is None:
            raise TeacherChoiceError("the Workers AI binding is not configured")
        reply = await asyncio.wait_for(
            self.ai.run(
                MODEL,
                {
                    "messages": [{"role": "user", "content": prompt}],
                    "response_format": {"type": "json_schema", "json_schema": schema},
                    "temperature": 0,
                    "max_tokens": 200,
                },
            ),
            timeout=DECISION_TIMEOUT_SECONDS,
        )
        return reply.to_py() if hasattr(reply, "to_py") else reply


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
TOMORROW_MOVE = {
    "kind": "rest",
    "say": "try-tomorrow",
    "reason": "an activity was failed three times today, so the lesson is left for tomorrow",
}


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


def rest_move(
    plans: dict[str, LessonPlan],
    progress: dict[str, PlanProgress],
    learner_class: str | None,
) -> dict:
    """The step when nothing more is offered today: a kind word about tomorrow, or that all is done."""
    return (
        TOMORROW_MOVE
        if left_for_tomorrow(plans, progress, learner_class)
        else REST_MOVE
    )


def lesson_standing(plan: LessonPlan, state: PlanProgress, today: date) -> str:
    """Where this learner stands on one lesson, in one word the app can colour."""
    if state.mastered:
        return "mastered"
    if state.assessed_days:
        return "learnt"
    if state.done_today or state.last_day is not None:
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
            # help is "learnt" and earns none, so "one more good day" is always true.
            "days_correct": len(progress[plan.id].independent_days),
            "current": current is not None and current.plan_id == plan.id,
        }
        for plan in plans_for_class(plans, learner_class)
    ]


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


def offers(options: list[Option], plan_id, event_id) -> bool:
    """Whether the teacher is currently offering this exact step."""
    return any(o.plan_id == plan_id and o.event_id == event_id for o in options)

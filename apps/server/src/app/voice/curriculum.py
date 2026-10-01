"""Lesson plans as data: Gagné's nine events, from the catalogue module the Worker ships."""

from dataclasses import dataclass

from .sequence import SequenceItem

LANGUAGES = ("en", "yo", "pcm")
SCHOOL_CLASSES = (
    "nursery_1",
    "nursery_2",
    "kindergarten",
    "primary_1",
    "primary_2",
    "primary_3",
    "primary_4",
    "primary_5",
    "primary_6",
    "jss_1",
    "jss_2",
    "jss_3",
)
TERMS = (1, 2, 3)
WEEKS_IN_TERM = 13
EVENTS = (
    "gain_attention",
    "inform_objectives",
    "stimulate_recall",
    "present_content",
    "provide_guidance",
    "elicit_performance",
    "provide_feedback",
    "assess_performance",
    "enhance_retention",
)


@dataclass(frozen=True)
class Activity:
    kind: str
    prompt_id: str | None = None
    items: tuple[SequenceItem, ...] = ()
    expected: tuple[str, ...] = ()


@dataclass(frozen=True)
class LessonEvent:
    id: str
    event: str
    say: dict[str, str]
    show: dict[str, str] | None
    activity: Activity | None
    # The id of the event this one is a shorter step towards: offered only to a child who has missed that
    # event twice running, and left behind once it is done.
    support: str | None = None

    def utterance_id(self, plan_id: str) -> str:
        return f"plan.{plan_id}.{self.id}"


@dataclass(frozen=True)
class Curriculum:
    """Where a lesson comes from in the national curriculum, and how well that is established."""

    source: str
    strand: str
    objective: str
    note: str | None = None

    @property
    def grounded(self) -> bool:
        return self.source != "ungrounded"


@dataclass(frozen=True)
class LessonPlan:
    id: str
    subject: str
    topic: str
    sequence: int
    term: int | None
    week: int | None
    title: dict[str, str]
    classes: tuple[str, ...]
    objectives: tuple[dict[str, str], ...]
    prerequisites: tuple[str, ...]
    curriculum: Curriculum | None
    events: tuple[LessonEvent, ...]

    def event(self, event_id: str) -> LessonEvent:
        return next(event for event in self.events if event.id == event_id)

    def event_of(self, kind: str) -> LessonEvent:
        return next(event for event in self.events if event.event == kind)


def _activity(payload: dict | None, language: str) -> Activity | None:
    if payload is None:
        return None
    if payload["kind"] == "existing":
        return Activity("existing", prompt_id=payload["prompt_id"])
    if payload["kind"] == "sequence":
        items = tuple(
            SequenceItem(item["id"], tuple(item["spoken"][language]))
            for item in payload["items"]
        )
        return Activity("sequence", items=items)
    return Activity("answer", expected=tuple(payload["expected"][language]))


def plan_from_json(payload: dict, language: str = "en") -> LessonPlan:
    """The plan for one teaching language; sequence aliases and answers follow that language."""
    events = tuple(
        LessonEvent(
            id=event["id"],
            event=event["event"],
            say=event["say"],
            show=event.get("show"),
            activity=_activity(event.get("activity"), language),
            support=event.get("support"),
        )
        for event in payload["events"]
    )
    return LessonPlan(
        id=payload["id"],
        subject=payload["subject"],
        topic=payload["topic"],
        sequence=payload["sequence"],
        term=payload.get("term"),
        week=payload.get("week"),
        title=payload["title"],
        classes=tuple(payload["classes"]),
        objectives=tuple(payload["objectives"]),
        prerequisites=tuple(payload["prerequisites"]),
        curriculum=Curriculum(**payload["curriculum"])
        if "curriculum" in payload
        else None,
        events=events,
    )


def load_plans(language: str = "en") -> dict[str, LessonPlan]:
    # The generated catalogue is imported here, not at the top: the Worker's startup snapshot
    # has a size cap, and no plan is needed until a request asks for one.
    from .lesson_plans.catalogue import PLANS

    plans = [plan_from_json(payload, language) for payload in PLANS]
    return {plan.id: plan for plan in sorted(plans, key=lambda plan: plan.sequence)}


def ungrounded_plans(plans: dict[str, LessonPlan]) -> list[str]:
    """Lessons that do not yet say where in the national curriculum they come from."""
    return [plan.id for plan in plans.values() if plan.curriculum is None]


def check_catalogue(plans: dict[str, LessonPlan]) -> list[str]:
    """Problems no schema can see: dangling prerequisites, event order, duplicate event ids."""
    problems = []
    unsourced = ungrounded_plans(plans)
    if unsourced:
        problems.append(
            f"these plans do not say where they come from: {', '.join(unsourced)}"
        )
    sequences = [plan.sequence for plan in plans.values()]
    if len(sequences) != len(set(sequences)):
        problems.append("two plans share a sequence number")
    for plan in plans.values():
        for prerequisite in plan.prerequisites:
            if prerequisite not in plans:
                problems.append(
                    f"{plan.id}: prerequisite {prerequisite} does not exist"
                )
            elif plans[prerequisite].sequence >= plan.sequence:
                problems.append(
                    f"{plan.id}: prerequisite {prerequisite} is not taught earlier"
                )
        ids = [event.id for event in plan.events]
        if len(ids) != len(set(ids)):
            problems.append(f"{plan.id}: duplicate event ids")
        if (plan.term is None) != (plan.week is None):
            problems.append(f"{plan.id}: a term and a week come together")
        if plan.term is None and not (plan.curriculum and plan.curriculum.note):
            problems.append(f"{plan.id}: no scheme week, and no note saying why")
        for event in plan.events:
            items = [
                item.id for item in (event.activity.items if event.activity else ())
            ]
            if len(items) != len(set(items)):
                problems.append(f"{plan.id}#{event.id}: duplicate sequence item ids")
        problems.extend(_support_problems(plan))
        order = [EVENTS.index(event.event) for event in plan.events]
        if order != sorted(order):
            problems.append(f"{plan.id}: events are not in Gagné order")
        if {event.event for event in plan.events} != set(EVENTS):
            problems.append(f"{plan.id}: not every one of the nine events is present")
        if not any(
            event.activity
            for event in plan.events
            if event.event == "elicit_performance"
        ):
            problems.append(f"{plan.id}: elicit_performance has no activity to mark")
        if not any(
            event.activity
            for event in plan.events
            if event.event == "assess_performance"
        ):
            problems.append(f"{plan.id}: assess_performance has no activity to mark")
    return problems


def _unlike(step: LessonEvent, target: LessonEvent) -> str | None:
    """Why a shorter step is not a smaller version of the event it supports, if it is not."""
    if step.activity is None or target.activity is None:
        return f"has no activity to compare with {target.id}'s"
    if target.activity.kind != "sequence":
        return (
            None
            if step.activity.kind == target.activity.kind
            else f"is not the same kind of activity as {target.id}"
        )
    own = [item.id for item in step.activity.items]
    full = [item.id for item in target.activity.items]
    if not own or len(own) >= len(full) or full[: len(own)] != own:
        return f"is not the start of {target.id}'s list, cut short"
    return None


def _support_problems(plan: LessonPlan) -> list[str]:
    """A shorter step must lead to the event it supports: earlier in the plan, the same list cut short, or
    a smaller question of the same kind."""
    problems = []
    ids = [event.id for event in plan.events]
    for event in plan.events:
        if event.support is None:
            continue
        label = f"{plan.id}#{event.id}"
        if event.event != "elicit_performance":
            problems.append(
                f"{label}: only an elicit_performance event can be a shorter step"
            )
        if sum(other.support == event.support for other in plan.events) > 1:
            problems.append(f"{label}: {event.support} has more than one shorter step")
        if event.support not in ids or ids.index(event.support) <= ids.index(event.id):
            problems.append(f"{label}: supports an event that does not come after it")
            continue
        target = plan.event(event.support)
        problem = _unlike(event, target)
        if problem:
            problems.append(f"{label}: {problem}")
    return problems


def plan_event_for_utterance(utterance_id: str, plans: dict[str, LessonPlan]):
    """The plan and event an utterance id names, or None when it is not a plan utterance."""
    if not utterance_id.startswith("plan."):
        return None
    plan_id, _, event_id = utterance_id.removeprefix("plan.").rpartition(".")
    plan = plans.get(plan_id)
    if plan is None or not any(event.id == event_id for event in plan.events):
        return None
    return plan, plan.event(event_id)


def activity_prompt_id(plan: LessonPlan, event: LessonEvent) -> str | None:
    """What the learner's reply to this event is marked against."""
    if event.activity is None:
        return None
    if event.activity.kind == "existing":
        return event.activity.prompt_id
    return event.utterance_id(plan.id)

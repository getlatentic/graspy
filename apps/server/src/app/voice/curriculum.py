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
    # The skill, from the skills registry, that doing this event's activity well shows.
    skill: str | None = None

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
            skill=event.get("skill"),
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


@dataclass(frozen=True)
class Skill:
    """Something a child can learn to do, and the skills it needs first."""

    id: str
    title: str
    prerequisites: tuple[str, ...]
    taught_by: str | None = None


def load_skills() -> dict[str, Skill]:
    from .lesson_plans.catalogue import SKILLS

    return {
        skill["id"]: Skill(
            skill["id"],
            skill["title"],
            tuple(skill["prerequisites"]),
            skill.get("taught_by"),
        )
        for skill in SKILLS
    }


def needs_first(skills: dict[str, Skill], skill_id: str) -> list[str]:
    """Every skill this one rests on, the nearest first, each once. A skill that needs itself is not in its own list."""
    seen: list[str] = []
    queue = [p for p in skills[skill_id].prerequisites if p in skills]
    while queue:
        at = queue.pop(0)
        if at not in seen and at != skill_id:
            seen.append(at)
            queue.extend(p for p in skills[at].prerequisites if p in skills)
    return seen


def _needs_itself(skills: dict[str, Skill], skill_id: str) -> bool:
    """Whether following what a skill needs leads back to it."""
    stack = [p for p in skills[skill_id].prerequisites if p in skills]
    visited: set[str] = set()
    while stack:
        at = stack.pop()
        if at == skill_id:
            return True
        if at not in visited:
            visited.add(at)
            stack.extend(p for p in skills[at].prerequisites if p in skills)
    return False


def check_skills(skills: dict[str, Skill], plans: dict[str, LessonPlan]) -> list[str]:
    """Problems no schema can see: a skill that needs one that does not exist or needs itself, a skill
    taught by a lesson that is not there, an event that names a skill that is not there."""
    problems = []
    for skill in skills.values():
        for needed in skill.prerequisites:
            if needed not in skills:
                problems.append(f"{skill.id}: needs {needed}, which does not exist")
        if _needs_itself(skills, skill.id):
            problems.append(f"{skill.id}: needs itself")
        if skill.taught_by is not None and skill.taught_by not in plans:
            problems.append(
                f"{skill.id}: taught by {skill.taught_by}, which does not exist"
            )
    for plan in plans.values():
        for event in plan.events:
            if event.skill is not None and event.skill not in skills:
                problems.append(
                    f"{plan.id}#{event.id}: names the skill {event.skill}, which does not exist"
                )
    return problems


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


REPAIR_PREFIX = "repair."


def repair_utterance_id(plan_id: str, event_id: str, broke_at: str) -> str:
    """The prompt that asks a child to carry on from where a list went wrong, rather than say it all again."""
    return f"{REPAIR_PREFIX}{plan_id}.{event_id}.{broke_at}"


ECHO_PREFIX = "echo."
# A check longer than this is said after the teacher only as far as this many items.
MOST_ECHOED = 6


def echo_utterance_id(plan_id: str, event_id: str) -> str:
    """The prompt that says the answer to a check for the child to say after the teacher."""
    return f"{ECHO_PREFIX}{plan_id}.{event_id}"


def echoable(event: LessonEvent) -> bool:
    """A check of what the lesson builds on that the plan itself defines, so its answer is known."""
    return (
        event.event == "stimulate_recall"
        and event.activity is not None
        and event.activity.kind in ("sequence", "answer")
    )


def echo_target(utterance_id: str, plans: dict[str, LessonPlan]):
    """The plan and recall event an echo prompt names, or None when it names nothing the plans have."""
    if not utterance_id.startswith(ECHO_PREFIX):
        return None
    plan_id, _, event_id = utterance_id.removeprefix(ECHO_PREFIX).rpartition(".")
    plan = plans.get(plan_id)
    event = next((e for e in plan.events if e.id == event_id), None) if plan else None
    return (plan, event) if event is not None and echoable(event) else None


PROBE_PREFIX = "probe."
SHOW_PREFIX = "show."


def probe_utterance_id(plan_id: str, event_id: str, broke_at: str) -> str:
    """The question that asks a child for the item their list broke at: what comes after the last right one."""
    return f"{PROBE_PREFIX}{plan_id}.{event_id}.{broke_at}"


def show_utterance_id(plan_id: str, event_id: str, broke_at: str) -> str:
    """The item their list broke at, said for the child to say after the teacher."""
    return f"{SHOW_PREFIX}{plan_id}.{event_id}.{broke_at}"


def item_step_target(utterance_id: str, prefix: str, plans: dict[str, LessonPlan]):
    """The plan, event, last item right and item broken at, for a probe or show prompt; None when it
    names nothing the plans have or the list broke at its first item (nothing came before it)."""
    if not utterance_id.startswith(prefix):
        return None
    rest, _, broke_at = utterance_id.removeprefix(prefix).rpartition(".")
    plan_id, _, event_id = rest.rpartition(".")
    plan = plans.get(plan_id)
    event = next((e for e in plan.events if e.id == event_id), None) if plan else None
    if event is None or not repairable(event):
        return None
    items = event.activity.items
    ids = [item.id for item in items]
    if broke_at not in ids or ids.index(broke_at) == 0:
        return None
    at = ids.index(broke_at)
    return plan, event, items[at - 1], items[at]


def repairable(event: LessonEvent) -> bool:
    """Only the child's own try at a list, not the check, the guided step, the recall or a shorter step."""
    return (
        event.event == "elicit_performance"
        and event.support is None
        and event.activity is not None
        and event.activity.kind == "sequence"
    )


def repair_target(utterance_id: str, plans: dict[str, LessonPlan]):
    """The plan, event and the items a repair prompt asks for, and the items before them.

    The required items run from the one the child's try broke at to the end of the list. The items
    before it, ending with the last one said rightly, are where the child is asked to start; they may
    be said again, and need not be. None when the id is not a repair prompt or names nothing the plans
    have, or when nothing came before the break (there is no right start to carry on from).
    """
    if not utterance_id.startswith(REPAIR_PREFIX):
        return None
    rest, _, broke_at = utterance_id.removeprefix(REPAIR_PREFIX).rpartition(".")
    plan_id, _, event_id = rest.rpartition(".")
    plan = plans.get(plan_id)
    event = next((e for e in plan.events if e.id == event_id), None) if plan else None
    if event is None or not repairable(event):
        return None
    items = event.activity.items
    ids = [item.id for item in items]
    if broke_at not in ids or ids.index(broke_at) == 0:
        return None
    at = ids.index(broke_at)
    return plan, event, items[at:], items[:at]


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

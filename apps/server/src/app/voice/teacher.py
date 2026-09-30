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

from .curriculum import LANGUAGES, LessonEvent, LessonPlan, activity_prompt_id
from .exercises import MULTIPLIERS, fact_prompt_id
from .lesson_store import lesson_day
from .speech.teacher_audio_contract import fact_utterance_id, teacher_utterance

MODEL = "@cf/openai/gpt-oss-120b"
DECISION_TIMEOUT_SECONDS = 20
MASTERY_DAYS = 2
# A check of what the child already knows is asked this many times a day; a child who cannot say it is taught
# next, not asked again.
RECALL_ATTEMPTS = 2


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


@dataclass(frozen=True)
class Option:
    plan_id: str
    event_id: str
    why: str
    facts: tuple[int, ...] = ()


@dataclass(frozen=True)
class Choice:
    plan_id: str
    event_id: str
    reason: str
    facts: tuple[int, ...] = ()


@dataclass
class PlanProgress:
    done_today: set[str] = field(default_factory=set)
    retry_today: set[str] = field(default_factory=set)
    feedback_owed: set[str] = field(default_factory=set)
    failed_today: dict[str, int] = field(default_factory=dict)
    last_decision: dict[str, str] = field(default_factory=dict)
    facts_owed: dict[str, frozenset[int]] = field(default_factory=dict)
    assessed_days: set[date] = field(default_factory=set)
    last_day: date | None = None

    @property
    def mastered(self) -> bool:
        return len(self.assessed_days) >= MASTERY_DAYS


def _served_first(plan: LessonPlan, owed: set[str]) -> set[str]:
    """The teacher answers one miss at a time, in plan order; that one is no longer owed."""
    for event in plan.events:
        if event.id in owed:
            return {event.id}
    return set()


def progress_by_plan(
    evidence: list[Evidence], plans: dict[str, LessonPlan], today: date
) -> dict[str, PlanProgress]:
    progress = {plan_id: PlanProgress() for plan_id in plans}
    for item in evidence:
        if item.plan_id not in plans:
            continue
        plan = progress[item.plan_id]
        plan.last_day = (
            item.day if plan.last_day is None else max(plan.last_day, item.day)
        )
        if item.day == today:
            plan.done_today.add(item.event_id)
            if plans[item.plan_id].event(item.event_id).event == "provide_feedback":
                plan.feedback_owed -= _served_first(
                    plans[item.plan_id], plan.feedback_owed
                )
        if item.decision is not None:
            plan.last_decision[item.event_id] = item.decision
            if item.day == today:
                owed = plan.facts_owed.get(item.event_id, frozenset())
                plan.facts_owed[item.event_id] = (
                    owed | item.facts_wrong
                ) - item.facts_right
            event = plans[item.plan_id].event(item.event_id)
            if event.event == "assess_performance" and item.decision == "correct":
                plan.assessed_days.add(item.day)
            if item.day == today:
                if item.decision == "correct":
                    plan.retry_today.discard(item.event_id)
                else:
                    plan.done_today.discard(item.event_id)
                    plan.retry_today.add(item.event_id)
                    plan.feedback_owed.add(item.event_id)
                    plan.failed_today[item.event_id] = (
                        plan.failed_today.get(item.event_id, 0) + 1
                    )
                    if (
                        event.event == "stimulate_recall"
                        and plan.failed_today[item.event_id] >= RECALL_ATTEMPTS
                    ):
                        plan.feedback_owed.discard(item.event_id)
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
    each been assessed once. A prerequisite belonging only to an earlier class was taught there and
    is taken as known. Mastery (two days) governs reviews, not what may be started."""
    offered = {plan.id for plan in plans_for_class(plans, learner_class)}
    for plan in plans_for_class(plans, learner_class):
        if progress[plan.id].assessed_days:
            continue
        needed = [p for p in plan.prerequisites if p in offered]
        if all(progress[prerequisite].assessed_days for prerequisite in needed):
            return plan
    return None


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
        if plan_id in own and today not in progress[plan_id].assessed_days
    ]


def next_event_in(plan: LessonPlan, state: PlanProgress) -> LessonEvent | None:
    """The first event not done today. An activity that failed today hears the plan's feedback
    event first, then comes round again, except a recall check the child has failed twice, which
    is left for the teaching that follows. None when the plan is complete for today."""
    for event in plan.events:
        if (
            event.event == "stimulate_recall"
            and state.failed_today.get(event.id, 0) >= RECALL_ATTEMPTS
        ):
            continue
        owed = state.facts_owed.get(event.id) or frozenset()
        if event.id in state.retry_today or owed:
            if event.id in state.feedback_owed:
                return plan.event_of("provide_feedback")
            return event
        if event.id not in state.done_today:
            return event
    return None


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
    and the next new plan. A lesson the learner opened themselves is the only step offered."""
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
            owed = progress[plan.id].facts_owed.get(event.id) or frozenset()
            return [Option(plan.id, event.id, why, tuple(sorted(owed)))]
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
    owed = progress[plan.id].facts_owed.get(event.id) or frozenset()
    why = f"open {plan.title['en']} at {event.event}"
    return [Option(plan.id, event.id, why, tuple(sorted(owed)))]


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
    )


async def choose(
    client, options: list[Option], evidence: list[Evidence], today: date, language: str
) -> Choice:
    """A single offered step needs no model; several do."""
    if not options:
        raise TeacherChoiceError("no step can be offered to this learner")
    if len(options) == 1:
        first = options[0]
        return Choice(first.plan_id, first.event_id, first.why, first.facts)
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
    plan: LessonPlan, event: LessonEvent, reason: str, facts: tuple[int, ...] = ()
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
    } | (narrowed_retry(event, facts) or {})


REST_MOVE = {"kind": "rest", "say": "finished", "reason": "nothing is due today"}


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
            "days_correct": len(progress[plan.id].assessed_days),
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
        result = json.loads(row["result_json"]) if row.get("result_json") else None
        exercise = (
            json.loads(row["exercise_json"]) if row.get("exercise_json") else None
        )
        day = lesson_day(int(row["at"]))
        items.append(
            Evidence(plan_id, event_id, day, row.get("decision"), result, exercise)
        )
    return items


def offers(options: list[Option], plan_id, event_id) -> bool:
    """Whether the teacher is currently offering this exact step."""
    return any(o.plan_id == plan_id and o.event_id == event_id for o in options)

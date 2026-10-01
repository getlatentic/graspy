"""Registry of the practice prompts, keyed by sample prompt ID.

Each entry says what a prompt asks of a learner. What counts as a right answer, and what the teacher
says about it, belong to the teacher agent; this side of the wire only knows the questions.
"""

import json
import re
import secrets
from dataclasses import dataclass
from enum import Enum

from .curriculum import load_plans, plan_event_for_utterance
from .recitation import RecitationExercise
from .sequence import SequenceItem


class Transport(Enum):
    SAHARA_STREAM = "sahara_stream"
    INTRON_SYNC = "intron_sync"


@dataclass(frozen=True)
class TurnEvaluation:
    decision: str
    feedback: str
    parsed_answer: int | None = None
    exercise: dict | None = None
    result: dict | None = None

    @property
    def exercise_json(self) -> str | None:
        return (
            None if self.exercise is None else json.dumps(self.exercise, sort_keys=True)
        )

    @property
    def result_json(self) -> str | None:
        return None if self.result is None else json.dumps(self.result, sort_keys=True)


@dataclass(frozen=True)
class SingleAnswerExercise:
    prompt_id: str
    task = "reasoning"
    topic = "multiplication"
    transport = Transport.SAHARA_STREAM


@dataclass(frozen=True)
class TimesTableExercise:
    prompt_id: str
    recitation: RecitationExercise
    task = "reasoning"
    topic = "multiplication"
    transport = Transport.INTRON_SYNC


@dataclass(frozen=True)
class FactAnswerExercise:
    """One answer to one fact, either guided practice or an independent check."""

    prompt_id: str
    table: int
    multiplier: int
    task = "reasoning"
    topic = "multiplication"
    transport = Transport.INTRON_SYNC


@dataclass(frozen=True)
class SequenceExercise:
    """A list said in order: days, months, counting. Marked by exact alias matching."""

    prompt_id: str
    subject: str
    items: tuple[SequenceItem, ...]
    # What follows a shorter step in the list it is a step towards: a child who counts on past the
    # end of the step has not said anything wrong.
    more: tuple[SequenceItem, ...] = ()
    task = "recitation"
    transport = Transport.INTRON_SYNC

    @property
    def topic(self) -> str:
        return self.subject


@dataclass(frozen=True)
class SpokenAnswerExercise:
    """One spoken answer matched against the plan's accepted spellings."""

    prompt_id: str
    subject: str
    expected: tuple[str, ...]
    task = "reasoning"
    transport = Transport.INTRON_SYNC

    @property
    def topic(self) -> str:
        return self.subject


def plan_exercise(prompt_id: str, language: str = "en"):
    found = plan_event_for_utterance(prompt_id, load_plans(language))
    if found is None:
        return None
    plan, event = found
    activity = event.activity
    if activity is None or activity.kind == "existing":
        return None
    if activity.kind == "sequence":
        return SequenceExercise(
            prompt_id, plan.subject, activity.items, _carried_on(plan, event)
        )
    return SpokenAnswerExercise(prompt_id, plan.subject, activity.expected)


def _carried_on(plan, event) -> tuple[SequenceItem, ...]:
    """The rest of the list a shorter step was cut from, or nothing for a step that is not one."""
    if event.support is None:
        return ()
    target = plan.event(event.support).activity
    return target.items[len(event.activity.items) :] if target else ()


SEVEN_TIMES_EIGHT = SingleAnswerExercise("mul_7x8_explain")
TABLES = range(1, 13)
MULTIPLIERS = range(1, 13)


def times_table_exercise(
    table: int, multipliers=tuple(MULTIPLIERS)
) -> TimesTableExercise:
    return TimesTableExercise(
        recite_prompt_id(table, multipliers),
        RecitationExercise(table, tuple(multipliers)),
    )


def recite_prompt_id(table: int, multipliers) -> str:
    facts = tuple(multipliers)
    if facts == tuple(MULTIPLIERS):
        return f"mul_table_{table}_recite_1_12"
    return f"mul_table_{table}_recite_facts_{'-'.join(map(str, facts))}"


def fact_prompt_id(table: int, multiplier: int, kind: str) -> str:
    return f"mul_fact_{table}x{multiplier}_{kind}"


TABLE_1_RECITATION = times_table_exercise(1)
_FULL_RECITE = re.compile(r"mul_table_(\d+)_recite_1_12")
_TARGETED_RECITE = re.compile(r"mul_table_(\d+)_recite_facts_((?:\d+)(?:-\d+)*)")
_FACT = re.compile(r"mul_fact_(\d+)x(\d+)_(say|answer)")


def _in_range(table: int, multipliers) -> bool:
    facts = list(multipliers)
    return (
        table in TABLES
        and bool(facts)
        and all(m in MULTIPLIERS for m in facts)
        and facts == sorted(set(facts))
    )


def exercise_by_prompt_id(prompt_id: str, language: str = "en"):
    if prompt_id.startswith("plan."):
        return plan_exercise(prompt_id, language)
    if prompt_id == SEVEN_TIMES_EIGHT.prompt_id:
        return SEVEN_TIMES_EIGHT
    if match := _FULL_RECITE.fullmatch(prompt_id):
        table = int(match[1])
        return times_table_exercise(table) if table in TABLES else None
    if match := _TARGETED_RECITE.fullmatch(prompt_id):
        table, facts = int(match[1]), [int(m) for m in match[2].split("-")]
        return times_table_exercise(table, facts) if _in_range(table, facts) else None
    if match := _FACT.fullmatch(prompt_id):
        table, multiplier = int(match[1]), int(match[2])
        return (
            FactAnswerExercise(prompt_id, table, multiplier)
            if _in_range(table, [multiplier])
            else None
        )
    return None


def activity_for(metadata: dict):
    language = metadata.get("spoken_language") or "en"
    activity = exercise_by_prompt_id(str(metadata.get("prompt_id") or ""), language)
    if activity is None:
        return None
    if metadata.get("task") != activity.task or metadata.get("topic") != activity.topic:
        return None
    return activity


PROCESSING_LEASE_MS = 3 * 60 * 1000
# The wait before each attempt at marking a turn, from the end of the one before. Every attempt pays
# for transcription and marking, so a turn that keeps failing stops being tried; the waits let a
# provider's short outage pass without spending the attempts.
RETRY_AFTER_MS = (0, 2 * 60 * 1000, 30 * 60 * 1000)
MAX_TURN_ATTEMPTS = len(RETRY_AFTER_MS)


def new_claim_token() -> str:
    """Identifies one worker's claim; a completion carrying another token is a stale worker's."""
    return secrets.token_hex(16)


def write_won(result) -> bool:
    """A guarded UPDATE persisted its row only when D1 reports a change."""
    return int(result.meta.changes) > 0


def _unfinished(row: dict, now_ms: int, lease_ms: int) -> bool:
    """Failed, or claimed by a worker that never finished.

    A crash after the claim leaves the row in `processing` forever; past the lease that row is
    treated as abandoned so the next request evaluates it instead of answering 202 for good.
    """
    if row["state"] == "failed":
        return True
    return row["state"] == "processing" and now_ms - int(row["updated_at"]) > lease_ms


def given_up(row: dict, now_ms: int, lease_ms: int = PROCESSING_LEASE_MS) -> bool:
    """A turn left unfinished on its last allowed attempt, which is never tried again."""
    attempts = int(row.get("attempts") or 0)
    return _unfinished(row, now_ms, lease_ms) and attempts >= MAX_TURN_ATTEMPTS


def wait_left_ms(row: dict, now_ms: int) -> int:
    """How long until the turn's next attempt is due; 0 once it is."""
    attempts = min(int(row.get("attempts") or 0), MAX_TURN_ATTEMPTS - 1)
    return max(0, int(row["updated_at"]) + RETRY_AFTER_MS[attempts] - now_ms)


def waiting(row: dict, now_ms: int) -> bool:
    """A turn whose next attempt is not due yet."""
    return wait_left_ms(row, now_ms) > 0


def awaiting_next_attempt(
    row: dict, now_ms: int, lease_ms: int = PROCESSING_LEASE_MS
) -> bool:
    """A turn left unfinished, failed or cut off past its lease, whose next attempt is not due.

    Nothing will change such a turn before `wait_left_ms`, which is then the later of the lease
    left (none) and the wait left, so the app is told to wait that long.
    """
    return _unfinished(row, now_ms, lease_ms) and waiting(row, now_ms)


def claimable(
    row: dict | None, now_ms: int, lease_ms: int = PROCESSING_LEASE_MS
) -> bool:
    """A turn may be (re)claimed when it is unfinished, has attempts left and the next is due."""
    if row is None:
        return True
    return (
        _unfinished(row, now_ms, lease_ms)
        and not given_up(row, now_ms, lease_ms)
        and not waiting(row, now_ms)
    )


def turn_payload(row: dict) -> dict:
    """Shape a stored tutoring turn into the evaluation API response."""
    payload = {
        "sample_id": row["sample_id"],
        "state": row["state"],
        "transcript": row["transcript"],
        "parsed_answer": row.get("parsed_answer"),
        "decision": row["decision"],
        "feedback": row["feedback"],
        "provider": row["provider"],
        "latency_ms": row["latency_ms"],
    }
    for key in ("exercise", "result", "language_evidence"):
        stored = row.get(f"{key}_json")
        if stored:
            payload[key] = json.loads(stored)
    if row.get("spoken_language"):
        payload["spoken_language"] = row["spoken_language"]
    return payload

from datetime import date, datetime, timedelta, timezone

from .curriculum import load_plans

COMPLETE_TURN_SQL = (
    "UPDATE tutoring_turns SET state = 'complete', transcript = ?2, "
    "parsed_answer = ?3, decision = ?4, feedback = ?5, provider = ?12, "
    "latency_ms = ?6, exercise_json = ?7, result_json = ?8, spoken_language = ?9, "
    "language_evidence_json = ?10, verdict = ?15, heard_kind = ?16, error_detail = NULL, "
    "updated_at = MAX(?11, COALESCE((SELECT MAX(t.updated_at) + 1 "
    "FROM tutoring_turns t JOIN samples s ON s.id = t.sample_id "
    "WHERE s.owner_id = ?14 AND t.state = 'complete'), 0)) "
    "WHERE sample_id = ?1 AND state = 'processing' AND claim_token = ?13"
)

LAGOS = timezone(timedelta(hours=1))
DAY_STARTS_AT_HOUR = 4


def lesson_day(epoch_ms: int) -> date:
    """A lesson day runs from four in the morning in Lagos, so a late lesson does not split at
    midnight; the learner's tomorrow is the teacher's tomorrow."""
    moment = datetime.fromtimestamp(epoch_ms / 1000, LAGOS)
    return (moment - timedelta(hours=DAY_STARTS_AT_HOUR)).date()


LEARNER_TURNS_SQL = (
    "SELECT t.sample_id, s.metadata_json, t.decision, t.result_json, t.updated_at "
    "FROM tutoring_turns t JOIN samples s ON s.id = t.sample_id "
    "WHERE s.owner_id = ?1 AND t.state = 'complete' "
    "AND json_extract(s.metadata_json, '$.topic') = 'multiplication' "
    "AND (json_extract(s.metadata_json, '$.prompt_id') LIKE 'mul_table_%' "
    "OR json_extract(s.metadata_json, '$.prompt_id') LIKE 'mul_fact_%') "
    "ORDER BY t.updated_at, t.sample_id"
)


EVIDENCE_SQL = (
    "SELECT s.metadata_json, t.decision, t.result_json, t.exercise_json, "
    "t.verdict, t.heard_kind, "
    "NULL AS plan_id, NULL AS event_id, t.updated_at AS at "
    "FROM tutoring_turns t JOIN samples s ON s.id = t.sample_id "
    "WHERE s.owner_id = ?1 AND t.state = 'complete' "
    "UNION ALL "
    "SELECT NULL, NULL, NULL, NULL, NULL, NULL, plan_id, event_id, at "
    "FROM lesson_events WHERE owner_id = ?1 "
    "ORDER BY at"
)

FIRST_ATTEMPT_SQL = (
    "SELECT t.sample_id FROM tutoring_turns t JOIN samples s ON s.id = t.sample_id "
    "WHERE s.owner_id = ?1 AND t.state = 'complete' "
    "AND json_extract(s.metadata_json, '$.plan_id') = ?2 "
    "AND json_extract(s.metadata_json, '$.event_id') = ?3 "
    "AND t.updated_at >= ?4 AND t.updated_at < ?5 "
    "AND (t.verdict IS NULL OR t.verdict != 'unheard' OR t.heard_kind = 'dont_know') "
    "ORDER BY s.created_at, t.sample_id LIMIT 1"
)

RECORD_EVENT_SQL = (
    "INSERT INTO lesson_events (owner_id, plan_id, event_id, reason, at) "
    "VALUES (?1, ?2, ?3, ?4, ?5)"
)

OFFER_SQL = (
    "INSERT OR IGNORE INTO lesson_offers (owner_id, plan_id, event_id, issued_at) "
    "VALUES (?1, ?2, ?3, ?4)"
)

WAS_OFFERED_SQL = (
    "SELECT 1 FROM lesson_offers WHERE owner_id = ?1 AND plan_id = ?2 AND event_id = ?3"
)


def day_bounds_ms(day: date) -> tuple[int, int]:
    """The first millisecond of a lesson day and of the day after it."""
    start = datetime(day.year, day.month, day.day, DAY_STARTS_AT_HOUR, tzinfo=LAGOS)
    return (
        round(start.timestamp() * 1000),
        round((start + timedelta(days=1)).timestamp() * 1000),
    )


async def answered_alone(
    database, learner: str, metadata: dict, sample_id: str, at_ms: int
) -> bool:
    """Whether this answer was the child's first try at that step today, at the plan's own question.

    A later try, or an answer to a list asked again from where it broke, came after help and shows
    less: it is the answer that decides whether a lesson is known, so it is told apart."""
    if str(metadata.get("prompt_id") or "").startswith("repair."):
        return False
    first_ms, last_ms = day_bounds_ms(lesson_day(at_ms))
    first = (
        await database.prepare(FIRST_ATTEMPT_SQL)
        .bind(
            learner,
            str(metadata.get("plan_id")),
            str(metadata.get("event_id")),
            first_ms,
            last_ms,
        )
        .first()
    )
    return first is not None and first["sample_id"] == sample_id


async def offer_step(database, learner: str, move: dict, at_ms: int) -> None:
    """Record that the teacher gave this learner this step. Repeating the step changes nothing."""
    if move.get("plan_id"):
        await (
            database.prepare(OFFER_SQL)
            .bind(learner, move["plan_id"], move["event_id"], at_ms)
            .run()
        )


async def was_offered(database, learner: str, plan_id: str, event_id: str) -> bool:
    """Whether the teacher ever gave this learner this step.

    An answer counts once because a sample has one turn, and mastery counts distinct days, so the
    offer is a lasting fact rather than a token: a note recorded offline still counts, and a
    provider failure can be retried.
    """
    found = (
        await database.prepare(WAS_OFFERED_SQL).bind(learner, plan_id, event_id).first()
    )
    return found is not None


async def load_options(
    env,
    learner: str,
    today: date,
    learner_class,
    language: str,
    chosen: str | None = None,
):
    """The steps the teacher would offer this learner right now.

    The one network call sits here so the choosing itself stays a plain function of what is known.
    """
    from .learner_memory import weakened_lessons
    from .teacher import evidence_from_rows, next_options, progress_by_plan

    plans = load_plans(language)
    response = await env.DB.prepare(EVIDENCE_SQL).bind(learner).all()
    rows = [
        row.to_py() if hasattr(row, "to_py") else row for row in response["results"]
    ]
    evidence = evidence_from_rows(rows, plans)
    progress = progress_by_plan(evidence, plans, today)
    weakened = await weakened_lessons(env, learner, learner_class)
    options = next_options(
        plans, progress, today, learner_class, evidence, chosen, weakened
    )
    return plans, evidence, rows, options


async def load_catalogue(env, learner: str, today: date, learner_class, language: str):
    """What the learner has done across every lesson of their class, and which one is next."""
    from .teacher import catalogue, progress_by_plan

    plans, evidence, _, options = await load_options(
        env, learner, today, learner_class, language
    )
    progress = progress_by_plan(evidence, plans, today)
    return {
        "day": today.isoformat(),
        "lessons": catalogue(
            plans, progress, today, learner_class, options[0] if options else None
        ),
    }


async def load_lesson_snapshot(
    env,
    teacher_client,
    learner: str,
    today: date,
    learner_class,
    language: str,
    chosen: str | None = None,
):
    from .teacher import choose, event_move, progress_by_plan, rest_move

    plans, evidence, rows, options = await load_options(
        env, learner, today, learner_class, language, chosen
    )
    if options:
        choice = await choose(teacher_client, options, evidence, today, language)
        plan = plans[choice.plan_id]
        move = event_move(
            plan,
            plan.event(choice.event_id),
            choice.reason,
            choice.facts,
            choice.variant,
        )
    else:
        move = rest_move(plans, progress_by_plan(evidence, plans, today), learner_class)
    await offer_step(
        env.DB, learner, move, round(datetime.now(LAGOS).timestamp() * 1000)
    )
    return {
        "move": move,
        "revision": rows[-1]["at"] if rows else 0,
        "day": today.isoformat(),
    }


async def record_event(
    database, learner: str, plan_id: str, event_id: str, at_ms: int
) -> None:
    await (
        database.prepare(RECORD_EVENT_SQL)
        .bind(learner, plan_id, event_id, None, at_ms)
        .run()
    )

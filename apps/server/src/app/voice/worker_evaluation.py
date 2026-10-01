import json
import logging
import math
import time

from starlette.responses import JSONResponse

from .curriculum import SCHOOL_CLASSES, load_plans
from .exercises import (
    MAX_TURN_ATTEMPTS,
    PROCESSING_LEASE_MS,
    RETRY_AFTER_MS,
    FactAnswerExercise,
    Transport,
    TurnEvaluation,
    activity_for,
    awaiting_next_attempt,
    claimable,
    given_up,
    new_claim_token,
    turn_payload,
    wait_left_ms,
    write_won,
)
from .expectation import expectation
from .learner_memory import (
    LearnerMemoryError,
    remember_assessment,
    teach_turn,
)
from .lesson_store import (
    COMPLETE_TURN_SQL,
    lesson_day,
    load_catalogue,
    load_lesson_snapshot,
    record_event,
    was_offered,
)
from .recording_retention import settle_audio
from .speech.intron_sync import (
    NoSpeechError,
    asr_language,
    needs_detection,
    transcribe_intron_sync,
)
from .speech.language_detect import detect_spoken_language, transcription_route
from .speech.sahara_stream import buffer_bytes, transcribe_sahara
from .speech.teacher_audio_contract import teacher_utterance
from .speech.whisper_asr import transcribe_english
from .teacher import TeacherChoiceError, TeacherModel

logger = logging.getLogger(__name__)

# A 409 names what it refused in `code`, since several refusals share the status.
NOT_OFFERED = "that step was not offered to this learner"


def _json(data, status=200):
    return JSONResponse(data, status_code=status)


def _turn_response(row, now_ms: int):
    if given_up(row, now_ms):
        return _json(
            {"detail": "this recording could not be marked", "code": "marking_failed"},
            status=409,
        )
    # A turn failed or cut off whose next attempt is not due answers as one still being marked, so
    # the app keeps the answer and no attempt is spent; it names the wait, so the app need not ask
    # sooner.
    if awaiting_next_attempt(row, now_ms):
        left = wait_left_ms(row, now_ms)
        return JSONResponse(
            {
                "sample_id": row["sample_id"],
                "state": "processing",
                "retry_after_ms": left,
            },
            status_code=202,
            headers={"Retry-After": str(math.ceil(left / 1000))},
        )
    state = row["state"]
    if state == "processing":
        return _json({"sample_id": row["sample_id"], "state": state}, status=202)
    if state == "failed":
        return _json(
            {"detail": row.get("error_detail") or "transcription failed"}, status=502
        )
    return _json(turn_payload(row))


async def _claim_turn(env, sample_id: str) -> str | None:
    now = round(time.time() * 1000)
    await (
        env.DB.prepare(
            "INSERT OR IGNORE INTO tutoring_turns "
            "(sample_id, state, attempts, updated_at) VALUES (?1, 'failed', 0, ?2)"
        )
        .bind(sample_id, now)
        .run()
    )
    token = new_claim_token()
    claimed = (
        await env.DB.prepare(
            "UPDATE tutoring_turns SET state = 'processing', attempts = attempts + 1, "
            "error_detail = NULL, updated_at = ?2, claim_token = ?4 "
            "WHERE sample_id = ?1 AND attempts < ?5 "
            "AND updated_at <= ?2 - (CASE WHEN attempts >= 2 THEN ?7 "
            "WHEN attempts = 1 THEN ?6 ELSE 0 END) "
            "AND (state = 'failed' OR (state = 'processing' AND updated_at < ?3)) "
            "RETURNING sample_id"
        )
        .bind(
            sample_id,
            now,
            now - PROCESSING_LEASE_MS,
            token,
            MAX_TURN_ATTEMPTS,
            RETRY_AFTER_MS[1],
            RETRY_AFTER_MS[2],
        )
        .first()
    )
    return token if claimed is not None else None


async def _current_turn(env, sample_id: str):
    row = (
        await env.DB.prepare("SELECT * FROM tutoring_turns WHERE sample_id = ?1")
        .bind(sample_id)
        .first()
    )
    return _turn_response(row, round(time.time() * 1000))


async def _transcribe(
    env, exercise, audio: bytes, metadata: dict, sample_id: str, evidence
):
    """Returns transcript, latency, the language recorded for the turn (None when unknown), and the
    recognizer that heard it."""
    api_key = str(getattr(env, "INTRON_API_KEY", ""))
    if exercise.transport is not Transport.INTRON_SYNC:
        transcript, latency = await transcribe_sahara(
            audio, metadata["language_pair"], api_key
        )
        return transcript, latency, asr_language(metadata), "sahara"
    language, recorded = transcription_route(evidence, asr_language(metadata))
    file_name = f"{sample_id}.wav"
    # Only a client that says the child spoke English has Whisper hear it: a recording of unknown language
    # keeps going to Intron, since Whisper told English would write plausible English for anything.
    if language == "en" and metadata.get("spoken_language") == "en":
        transcript, latency, heard_by = await transcribe_english(
            env, audio, api_key, file_name, transcribe_intron_sync
        )
        return transcript, latency, recorded, heard_by
    transcript, latency = await transcribe_intron_sync(
        audio, language, api_key, file_name
    )
    return transcript, latency, recorded, "intron_sync"


async def lesson_move(
    env,
    learner: str,
    learner_class: str | None,
    language: str,
    chosen: str | None = None,
):
    """The teacher's next step for this learner, chosen now."""
    if learner_class is not None and learner_class not in SCHOOL_CLASSES:
        return _json({"detail": "unsupported learner class"}, status=400)
    if language not in ("en", "yo", "pcm"):
        return _json({"detail": "language must be en, yo, or pcm"}, status=400)
    today = lesson_day(round(time.time() * 1000))
    try:
        client = TeacherModel(getattr(env, "AI", None))
        snapshot = await load_lesson_snapshot(
            env, client, learner, today, learner_class, language, chosen
        )
    except (TeacherChoiceError, LearnerMemoryError) as error:
        return _json({"detail": str(error)}, status=502)
    move = snapshot["move"]
    print(
        json.dumps(
            {
                "teacher": learner[-6:],
                "class": learner_class,
                "day": snapshot["day"],
                "plan": move.get("plan_id"),
                "event": move.get("event_id"),
                "prompt": (move.get("activity") or {}).get("prompt_id"),
                "reason": move.get("reason"),
            }
        )
    )
    return _json(snapshot)


async def lesson_catalogue(env, learner: str, learner_class: str | None, language: str):
    """Every lesson of the learner's class and where they stand on it, for the Home screen."""
    if learner_class is not None and learner_class not in SCHOOL_CLASSES:
        return _json({"detail": "unsupported learner class"}, status=400)
    if language not in ("en", "yo", "pcm"):
        return _json({"detail": "language must be en, yo, or pcm"}, status=400)
    today = lesson_day(round(time.time() * 1000))
    try:
        return _json(await load_catalogue(env, learner, today, learner_class, language))
    except LearnerMemoryError as error:
        return _json({"detail": str(error)}, status=502)


async def lesson_event_heard(env, learner: str, payload: dict):
    """The learner heard a note the teacher issued; it becomes part of the teacher's memory."""
    plan_id, event_id = str(payload.get("plan_id")), str(payload.get("event_id"))
    plan = load_plans().get(plan_id)
    if plan is None or not any(event.id == event_id for event in plan.events):
        return _json({"detail": "unknown plan event"}, status=400)
    if not await was_offered(env.DB, learner, plan_id, event_id):
        return _json({"detail": NOT_OFFERED, "code": "step_not_offered"}, status=409)
    await record_event(env.DB, learner, plan.id, event_id, round(time.time() * 1000))
    return _json({"plan_id": plan.id, "event_id": event_id})


def _asked_line(metadata: dict, language: str) -> str:
    """The words the child actually heard, so the teacher answers the question it asked."""
    prompt_id = str(metadata.get("prompt_id") or "")
    if prompt_id.startswith("repair."):
        return teacher_utterance(prompt_id, language).text
    plan = load_plans(language).get(str(metadata.get("plan_id")))
    event = plan and next(
        (e for e in plan.events if e.id == metadata.get("event_id")), None
    )
    return event.say.get(language, "") if event else ""


async def _taught(env, learner, sample_id, metadata, activity, transcript, language):
    """One answer, marked and answered by the teacher rather than by a stored sentence.

    Every kind of prompt comes through here. The teacher marks it with the tool that fits what was
    asked, then says something back about this child's try, so nothing a learner hears was written
    before they spoke.
    """
    expect = expectation(activity)
    reply = await teach_turn(
        env,
        learner,
        sample_id,
        str(metadata.get("plan_id") or expect["item"]),
        {
            "prompt": _asked_line(metadata, language),
            "heard": transcript,
            "language": language,
            "expect": expect,
        },
    )
    said = reply.get("said") or ""
    return TurnEvaluation(
        reply["decision"],
        reply["say"],
        parsed_answer=int(said) if said.isdigit() else None,
        exercise=_exercise_json(activity, expect),
        result=reply.get("result"),
    )


def _exercise_json(activity, expect: dict) -> dict | None:
    """What the app needs to draw the question the result belongs to."""
    if expect["kind"] == "recitation":
        return activity.recitation.to_json()
    if expect["kind"] == "sequence":
        return {"kind": "sequence", "items": [item["id"] for item in expect["items"]]}
    if isinstance(activity, FactAnswerExercise):
        return {
            "kind": "fact_answer",
            "table": activity.table,
            "multiplier": activity.multiplier,
        }
    return None


async def _answers_a_taught_step(env, learner: str, metadata: dict) -> bool:
    """A recording may only answer a step this learner was actually given."""
    plan_id, event_id = metadata.get("plan_id"), metadata.get("event_id")
    if plan_id is None:
        return True
    return await was_offered(env.DB, learner, plan_id, event_id)


async def _complete_turn(
    env,
    learner: str,
    sample_id: str,
    token: str,
    provider: str,
    transcript: str,
    latency_ms: int,
    evaluation,
    language,
    evidence,
    metadata,
):
    updated_at = round(time.time() * 1000)
    evidence_json = json.dumps(evidence.to_json(), sort_keys=True) if evidence else None
    written = (
        await env.DB.prepare(COMPLETE_TURN_SQL)
        .bind(
            sample_id,
            transcript,
            evaluation.parsed_answer,
            evaluation.decision,
            evaluation.feedback,
            latency_ms,
            evaluation.exercise_json,
            evaluation.result_json,
            language,
            evidence_json,
            updated_at,
            provider,
            token,
            learner,
        )
        .run()
    )
    if not write_won(written):
        return await _current_turn(env, sample_id)
    await settle_audio(env, sample_id)
    await remember_assessment(env, learner, sample_id, metadata, evaluation.decision)
    return _json(
        turn_payload(
            {
                "sample_id": sample_id,
                "state": "complete",
                "transcript": transcript,
                "parsed_answer": evaluation.parsed_answer,
                "decision": evaluation.decision,
                "feedback": evaluation.feedback,
                "provider": provider,
                "latency_ms": latency_ms,
                "exercise_json": evaluation.exercise_json,
                "result_json": evaluation.result_json,
                "spoken_language": language,
                "language_evidence_json": evidence_json,
            }
        )
    )


def _stages(sample_id: str):
    """Reports how long each part of a turn took, so a slow answer names what was slow."""
    last = time.perf_counter()

    def done(part: str) -> None:
        nonlocal last
        now = time.perf_counter()
        print(
            json.dumps(
                {"turn": sample_id[-6:], "part": part, "ms": round((now - last) * 1000)}
            )
        )
        last = now

    return done


def failure_status(error: Exception) -> int:
    """422 when the audio itself carries no speech, 502 when a provider or transport failed."""
    return 422 if isinstance(error, NoSpeechError) else 502


async def _fail_turn(env, sample_id: str, token: str, error: Exception, evidence=None):
    """A recording with no speech in it is marked failed for good, as the same audio would say the
    same again; any other failure leaves the attempts that are left."""
    detail = str(error)[:500] or "transcription failed"
    evidence_json = json.dumps(evidence.to_json(), sort_keys=True) if evidence else None
    spent = MAX_TURN_ATTEMPTS if isinstance(error, NoSpeechError) else 0
    failed = (
        await env.DB.prepare(
            "UPDATE tutoring_turns SET state = 'failed', error_detail = ?2, "
            "language_evidence_json = ?3, updated_at = ?4, attempts = MAX(attempts, ?6) "
            "WHERE sample_id = ?1 AND state = 'processing' AND claim_token = ?5 "
            "RETURNING attempts"
        )
        .bind(sample_id, detail, evidence_json, round(time.time() * 1000), token, spent)
        .first()
    )
    if failed is None:
        return await _current_turn(env, sample_id)
    if int(failed["attempts"]) >= MAX_TURN_ATTEMPTS:
        await settle_audio(env, sample_id)
    code = "no_speech" if isinstance(error, NoSpeechError) else "provider_failure"
    return _json({"detail": detail, "code": code}, status=failure_status(error))


def _audio_not_ready():
    """The recording is not there to mark: it never arrived, or was deleted before it was marked."""
    return _json(
        {"detail": "sample audio is not ready", "code": "audio_not_ready"}, status=409
    )


async def evaluate_sample(env, learner: str, sample_id: str):
    sample = (
        await env.DB.prepare(
            "SELECT id, owner_id, state, metadata_json, audio_key, audio_deleted_at "
            "FROM samples WHERE id = ?1 AND owner_id = ?2"
        )
        .bind(sample_id, learner)
        .first()
    )
    if sample is None:
        return _json({"detail": "sample was not found"}, status=404)
    if sample["state"] != "ready":
        return _audio_not_ready()
    metadata = json.loads(sample["metadata_json"])
    activity = activity_for(metadata)
    if activity is None:
        return _json(
            {
                "detail": "sample is not a supported practice prompt",
                "code": "unsupported_prompt",
            },
            status=409,
        )
    existing = (
        await env.DB.prepare("SELECT * FROM tutoring_turns WHERE sample_id = ?1")
        .bind(sample_id)
        .first()
    )
    now = round(time.time() * 1000)
    if existing is not None and not claimable(existing, now):
        if existing["state"] == "complete" or given_up(existing, now):
            await settle_audio(env, sample_id)
        if existing["state"] == "complete":
            await remember_assessment(
                env, learner, sample_id, metadata, existing["decision"]
            )
        return _turn_response(existing, now)
    if sample["audio_deleted_at"] is not None:
        return _audio_not_ready()
    if not await _answers_a_taught_step(env, learner, metadata):
        return _json({"detail": NOT_OFFERED, "code": "step_not_offered"}, status=409)
    token = await _claim_turn(env, sample_id)
    if token is None:
        return await _current_turn(env, sample_id)
    evidence = None
    try:
        stage = _stages(sample_id)
        stored = await env.AUDIO.get(sample["audio_key"])
        if stored is None:
            raise RuntimeError("stored recording is missing")
        audio = buffer_bytes(await stored.arrayBuffer())
        stage("fetch_audio")
        if needs_detection(metadata) and getattr(env, "AI", None) is not None:
            evidence = await detect_spoken_language(env, audio)
            stage("detect_language")
        transcript, latency_ms, language, provider = await _transcribe(
            env, activity, audio, metadata, sample_id, evidence
        )
        stage("transcribe")
        evaluation = await _taught(
            env,
            learner,
            sample_id,
            metadata,
            activity,
            transcript,
            metadata.get("lesson_language", "en"),
        )
        stage("teach")
        return await _complete_turn(
            env,
            learner,
            sample_id,
            token,
            provider,
            transcript,
            latency_ms,
            evaluation,
            language,
            evidence,
            metadata,
        )
    except Exception as error:
        logger.exception("Turn %s failed", sample_id)
        return await _fail_turn(env, sample_id, token, error, evidence)

import json
from types import SimpleNamespace

from app.voice.exercises import (
    TABLE_1_RECITATION,
    Transport,
    activity_for,
    exercise_by_prompt_id,
    turn_payload,
)


def test_only_reviewed_multiplication_prompts_are_evaluable():
    metadata = {"task": "reasoning", "topic": "multiplication"}
    assert activity_for({**metadata, "prompt_id": "mul_7x8_explain"}) is not None
    assert activity_for({**metadata, "prompt_id": "mul_table_1_recite_1_12"}) == (
        TABLE_1_RECITATION
    )
    assert activity_for({**metadata, "prompt_id": "mul_9x9"}) is None
    assert (
        activity_for({**metadata, "topic": "addition", "prompt_id": "mul_7x8_explain"})
        is None
    )
    assert (
        activity_for({"topic": "multiplication", "prompt_id": "mul_7x8_explain"})
        is None
    )
    for table in range(1, 13):
        assert (
            exercise_by_prompt_id(f"mul_table_{table}_recite_1_12").recitation.table
            == table
        )
    assert exercise_by_prompt_id("mul_table_13_recite_1_12") is None


def test_targeted_recitations_and_fact_answers_are_named_by_their_facts():
    targeted = exercise_by_prompt_id("mul_table_2_recite_facts_3-7-11")
    assert targeted.recitation.multipliers == (3, 7, 11)
    assert exercise_by_prompt_id("mul_table_2_recite_facts_7-3") is None
    assert exercise_by_prompt_id("mul_table_2_recite_facts_13") is None
    check = exercise_by_prompt_id("mul_fact_6x7_answer")
    assert check.transport is Transport.INTRON_SYNC
    assert (check.table, check.multiplier) == (6, 7)
    assert exercise_by_prompt_id("mul_fact_6x7_say").multiplier == 7
    assert exercise_by_prompt_id("mul_fact_6x13_say") is None


def test_turn_payload_matches_the_table_one_api_contract():
    payload = turn_payload(
        {
            "sample_id": "gvm_example",
            "state": "complete",
            "transcript": "one times one is one",
            "parsed_answer": None,
            "decision": "try_again",
            "feedback": "You got 1 of 12.",
            "provider": "sahara",
            "latency_ms": 1234,
            "exercise_json": json.dumps(TABLE_1_RECITATION.recitation.to_json()),
            "result_json": json.dumps(
                {
                    "correct_multipliers": [1],
                    "missing_multipliers": [2],
                    "incorrect_facts": [],
                }
            ),
        }
    )

    assert payload == {
        "sample_id": "gvm_example",
        "state": "complete",
        "transcript": "one times one is one",
        "parsed_answer": None,
        "decision": "try_again",
        "feedback": "You got 1 of 12.",
        "provider": "sahara",
        "latency_ms": 1234,
        "exercise": {
            "kind": "times_table_recitation",
            "table": 1,
            "from": 1,
            "to": 12,
            "multipliers": list(range(1, 13)),
        },
        "result": {
            "correct_multipliers": [1],
            "missing_multipliers": [2],
            "incorrect_facts": [],
        },
    }


def test_turn_payload_omits_structured_fields_for_the_single_answer_turn():
    payload = turn_payload(
        {
            "sample_id": "gvm_single",
            "state": "complete",
            "transcript": "56",
            "parsed_answer": 56,
            "decision": "correct",
            "feedback": "Correct",
            "provider": "sahara",
            "latency_ms": 10,
            "exercise_json": None,
            "result_json": None,
        }
    )

    assert "exercise" not in payload
    assert "result" not in payload
    assert payload["parsed_answer"] == 56


def test_a_processing_turn_is_claimable_only_after_its_lease_expires():
    from app.voice.exercises import PROCESSING_LEASE_MS, claimable

    now = 10_000_000
    assert claimable(None, now)
    assert claimable({"state": "failed", "updated_at": now}, now)
    assert not claimable({"state": "complete", "updated_at": now}, now)
    assert not claimable({"state": "processing", "updated_at": now - 1000}, now)
    assert claimable(
        {"state": "processing", "updated_at": now - PROCESSING_LEASE_MS - 1}, now
    )


def test_a_turn_is_given_up_once_its_last_attempt_is_left_unfinished():
    from app.voice.exercises import (
        MAX_TURN_ATTEMPTS,
        PROCESSING_LEASE_MS,
        claimable,
        given_up,
    )

    now = 10_000_000
    last = {"attempts": MAX_TURN_ATTEMPTS, "updated_at": now}
    abandoned = last | {"state": "processing", "updated_at": 0}
    for row in (last | {"state": "failed"}, abandoned):
        assert given_up(row, now) and not claimable(row, now)
    running = last | {"state": "processing", "updated_at": now - PROCESSING_LEASE_MS}
    for row in (last | {"state": "complete"}, running):
        assert not given_up(row, now)
    retry = {"state": "failed", "attempts": MAX_TURN_ATTEMPTS - 1, "updated_at": now}
    assert claimable(retry, now) and not given_up(retry, now)


def test_a_worker_past_its_lease_cannot_win_the_write():

    from app.voice.exercises import PROCESSING_LEASE_MS, new_claim_token, write_won
    from app.voice.learner_memory import TEACH_TIMEOUT_SECONDS
    from app.voice.speech.intron_sync import SYNC_TIMEOUT_MS
    from app.voice.speech.language_detect import CLASSIFIER_TIMEOUT_SECONDS

    limits = CLASSIFIER_TIMEOUT_SECONDS + TEACH_TIMEOUT_SECONDS
    assert SYNC_TIMEOUT_MS + limits * 1000 < PROCESSING_LEASE_MS
    assert new_claim_token() != new_claim_token()
    assert write_won(SimpleNamespace(meta=SimpleNamespace(changes=1)))
    assert not write_won(SimpleNamespace(meta=SimpleNamespace(changes=0)))


def test_the_turn_table_accepts_every_provider_the_worker_records():
    import sqlite3
    from pathlib import Path

    migrations = sorted((Path(__file__).parent.parent / "migrations").glob("*.sql"))
    db = sqlite3.connect(":memory:")
    for migration in migrations:
        db.executescript(migration.read_text())
    db.execute(
        "INSERT INTO samples (id, owner_id, idempotency_key, metadata_fingerprint, state, "
        "metadata_json, audio_key, created_at, uploaded_at) "
        "VALUES ('s', 'o', 'k', 'fp', 'ready', '{}', 'a', 0, 0)"
    )
    for provider in ("sahara", "intron_sync"):
        db.execute(
            "INSERT OR REPLACE INTO tutoring_turns (sample_id, state, transcript, decision, "
            "feedback, provider, latency_ms, updated_at) "
            "VALUES ('s', 'complete', 't', 'correct', 'f', ?, 1, 0)",
            (provider,),
        )

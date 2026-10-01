import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.voice import learner_memory
from app.voice.lesson_store import (
    COMPLETE_TURN_SQL,
    EVIDENCE_SQL,
    LEARNER_TURNS_SQL,
    OFFER_SQL,
    RECORD_EVENT_SQL,
    WAS_OFFERED_SQL,
    load_lesson_snapshot,
)

T1 = "mathematics.multiplication.table-1"
T2 = "mathematics.multiplication.table-2"
FIRST = (
    "mathematics.number.counting-in-fives"  # the first Primary 4 lesson in NERDC order
)


class NoModel:
    async def decide(self, prompt, tool):
        raise AssertionError("one option needs no model")


def test_concurrent_completions_keep_both_answers_and_stale_claims_cannot_write(
    tmp_path,
):
    path = tmp_path / "lessons.db"
    db = sqlite3.connect(path)
    for migration in sorted((Path(__file__).parents[1] / "migrations").glob("*.sql")):
        db.executescript(migration.read_text())
    for sample, fact in (("a", 3), ("b", 4)):
        metadata = json.dumps(
            {"topic": "multiplication", "prompt_id": f"mul_fact_2x{fact}_say"}
        )
        db.execute(
            "INSERT INTO samples (id, owner_id, idempotency_key, metadata_fingerprint, "
            "state, metadata_json, created_at, audio_key, uploaded_at) "
            "VALUES (?, 'owner', ?, 'fp', 'ready', ?, 0, ?, 0)",
            (sample, sample, metadata, sample),
        )
        db.execute(
            "INSERT INTO tutoring_turns (sample_id, state, updated_at, claim_token) "
            "VALUES (?, 'processing', 0, ?)",
            (sample, sample),
        )
    db.commit()

    def complete(sample, token):
        with sqlite3.connect(path) as connection:
            return connection.execute(
                COMPLETE_TURN_SQL,
                (
                    sample,
                    "six",
                    6,
                    "correct",
                    "Correct",
                    100,
                    None,
                    None,
                    "en",
                    None,
                    1788681600000,
                    "intron_sync",
                    token,
                    "owner",
                    "correct",
                    None,
                ),
            ).rowcount

    with ThreadPoolExecutor(2) as pool:
        assert list(pool.map(lambda sample: complete(sample, sample), ("a", "b"))) == [
            1,
            1,
        ]
    assert complete("a", "expired-claim") == 0
    db.row_factory = sqlite3.Row
    rows = [dict(row) for row in db.execute(LEARNER_TURNS_SQL, ("owner",))]
    assert {row["sample_id"] for row in rows} == {"a", "b"}
    assert rows[1]["updated_at"] == rows[0]["updated_at"] + 1
    db.execute(RECORD_EVENT_SQL, ("owner", T2, "present", None, 1788681600002))
    evidence = [dict(row) for row in db.execute(EVIDENCE_SQL, ("owner",))]
    assert [row["at"] for row in evidence] == sorted(row["at"] for row in evidence)
    assert evidence[-1]["plan_id"] == T2 and evidence[-1]["event_id"] == "present"
    assert list(db.execute(EVIDENCE_SQL, ("another-owner",))) == []


@pytest.mark.asyncio
async def test_an_empty_history_starts_the_first_plan_of_the_class_and_a_new_day_is_visible(
    monkeypatch,
):
    monkeypatch.setattr(learner_memory, "_ask", AsyncMock(return_value={"due": []}))
    env = MagicMock()
    database = env.DB
    database.prepare.return_value.bind.return_value.all = AsyncMock(
        return_value={"results": []}
    )
    database.prepare.return_value.bind.return_value.run = AsyncMock(return_value=None)
    first = await load_lesson_snapshot(
        env, NoModel(), "owner", date(2026, 9, 6), "primary_4", "yo"
    )
    second = await load_lesson_snapshot(
        env, NoModel(), "owner", date(2026, 9, 7), "primary_4", "yo"
    )
    assert first["revision"] == second["revision"] == 0
    assert first["day"] != second["day"]
    assert first["move"]["kind"] == "event"
    assert (
        first["move"]["plan_id"] == FIRST and first["move"]["event_id"] == "attention"
    )
    assert first["move"]["say"] == f"plan.{FIRST}.attention"
    assert database.prepare.call_args_list[0].args == (EVIDENCE_SQL,)
    assert database.prepare.call_args_list[1].args == (OFFER_SQL,)
    offered = database.prepare.return_value.bind.call_args.args
    assert offered[:3] == ("owner", FIRST, "attention")


def test_an_offer_is_one_lasting_fact_per_step(tmp_path):
    path = tmp_path / "offers.db"
    db = sqlite3.connect(path)
    for migration in sorted((Path(__file__).parents[1] / "migrations").glob("*.sql")):
        db.executescript(migration.read_text())

    def offer(owner, plan, event, at):
        db.execute(_bind(OFFER_SQL), (owner, plan, event, at))
        db.commit()

    def offered(owner, plan, event):
        return (
            db.execute(_bind(WAS_OFFERED_SQL), (owner, plan, event)).fetchone()
            is not None
        )

    offer("owner", T2, "practice", 10)
    offer("owner", T2, "practice", 20)
    rows = db.execute(
        "SELECT issued_at FROM lesson_offers WHERE owner_id = 'owner'"
    ).fetchall()
    assert rows == [(10,)], "repeating a step keeps the first offer and adds nothing"
    assert offered("owner", T2, "practice")
    assert offered("owner", T2, "practice"), (
        "an answer never uses up the fact that it was taught"
    )
    assert not offered("owner", T2, "assess")
    assert not offered("someone-else", T2, "practice")


def _bind(sql: str) -> str:
    """The Worker binds by ?1..?4; SQLite here binds by position."""
    for token in ("?1", "?2", "?3", "?4"):
        sql = sql.replace(token, "?")
    return sql


AT = 1_790_000_000_000  # inside a lesson day: after 04:00 in Lagos


def _turns(tmp_path, turns):
    """A real database with every migration, holding these completed turns of one learner's step.

    Each is (sample id, created_at, updated_at, verdict, heard_kind, prompt_id)."""
    db = sqlite3.connect(tmp_path / "turns.db")
    for migration in sorted((Path(__file__).parents[1] / "migrations").glob("*.sql")):
        db.executescript(migration.read_text())
    for sample, created, updated, verdict, heard, prompt in turns:
        metadata = json.dumps(
            {"plan_id": "p", "event_id": "assess", "prompt_id": prompt}
        )
        db.execute(
            "INSERT INTO samples (id, owner_id, idempotency_key, metadata_fingerprint, state, "
            "metadata_json, created_at, audio_key, uploaded_at) VALUES (?, 'owner', ?, 'fp', 'ready', ?, ?, ?, 0)",
            (sample, sample, metadata, created, sample),
        )
        db.execute(
            "INSERT INTO tutoring_turns (sample_id, state, transcript, decision, feedback, provider, "
            "latency_ms, updated_at, claim_token, verdict, heard_kind) "
            "VALUES (?, 'complete', 'x', 'correct', 'f', 'whisper', 1, ?, ?, ?, ?)",
            (sample, updated, sample, verdict, heard),
        )
    db.commit()
    return db


class _Database:
    """The part of the Worker's database binding the lookup uses, over a real sqlite database."""

    def __init__(self, db):
        self.db, self.sql, self.args = db, None, ()

    def prepare(self, sql):
        self.sql = sql
        return self

    def bind(self, *args):
        self.args = args
        return self

    async def first(self):
        row = self.db.execute(self.sql, self.args).fetchone()
        return None if row is None else {"sample_id": row[0]}


META = {"plan_id": "p", "event_id": "assess", "prompt_id": "plan.p.assess"}


@pytest.mark.asyncio
async def test_the_first_answer_recorded_is_the_one_given_alone_even_if_marked_last(
    tmp_path,
):
    from app.voice.lesson_store import answered_alone

    db = _Database(
        _turns(
            tmp_path,
            [
                ("a", AT, AT + 9000, None, None, "plan.p.assess"),
                ("b", AT + 5, AT + 100, None, None, "plan.p.assess"),
            ],
        )
    )
    assert await answered_alone(db, "owner", META, "a", AT)
    assert not await answered_alone(db, "owner", META, "b", AT)


@pytest.mark.asyncio
async def test_a_recording_nobody_could_hear_is_not_a_try_but_not_knowing_is(tmp_path):
    from app.voice.lesson_store import answered_alone

    heard_nothing = _Database(
        _turns(
            tmp_path,
            [
                ("a", AT, AT + 1, "unheard", "garbled", "plan.p.assess"),
                ("b", AT + 5, AT + 6, None, None, "plan.p.assess"),
            ],
        )
    )
    assert await answered_alone(heard_nothing, "owner", META, "b", AT)
    assert not await answered_alone(heard_nothing, "owner", META, "a", AT)


@pytest.mark.asyncio
async def test_a_child_saying_they_do_not_know_has_tried(tmp_path):
    from app.voice.lesson_store import answered_alone

    db = _Database(
        _turns(
            tmp_path,
            [
                ("a", AT, AT + 1, "unheard", "dont_know", "plan.p.assess"),
                ("b", AT + 5, AT + 6, None, None, "plan.p.assess"),
            ],
        )
    )
    assert await answered_alone(db, "owner", META, "a", AT)
    assert not await answered_alone(db, "owner", META, "b", AT)


@pytest.mark.asyncio
async def test_only_a_try_the_same_lesson_day_counts_and_the_day_turns_at_four_in_lagos(
    tmp_path,
):
    from datetime import date

    from app.voice.lesson_store import answered_alone, day_bounds_ms, lesson_day

    first_ms, last_ms = day_bounds_ms(date(2026, 9, 30))
    assert lesson_day(first_ms) == date(2026, 9, 30) and lesson_day(
        first_ms - 1
    ) == date(2026, 9, 29)
    assert lesson_day(last_ms - 1) == date(2026, 9, 30) and lesson_day(last_ms) == date(
        2026, 10, 1
    )
    yesterday = first_ms - 1
    db = _Database(
        _turns(
            tmp_path,
            [
                ("old", yesterday - 5, yesterday, None, None, "plan.p.assess"),
                ("new", first_ms + 5, first_ms + 6, None, None, "plan.p.assess"),
            ],
        )
    )
    assert await answered_alone(db, "owner", META, "new", first_ms + 6)


@pytest.mark.asyncio
async def test_a_list_asked_again_from_where_it_broke_is_not_an_answer_given_alone():
    from app.voice.lesson_store import answered_alone

    meta = {
        "plan_id": "p",
        "event_id": "practice",
        "prompt_id": "repair.p.practice.friday",
    }
    assert not await answered_alone(None, "owner", meta, "first", AT)

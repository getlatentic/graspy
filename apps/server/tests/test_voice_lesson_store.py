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


class _Row(dict):
    pass


class _Turns:
    """The completed turns of one step today, first to last, as the database would order them."""

    def __init__(self, samples):
        self.samples = samples
        self.bound = None

    def prepare(self, sql):
        assert "ORDER BY t.updated_at, t.sample_id LIMIT 1" in sql
        return self

    def bind(self, *args):
        self.bound = args
        return self

    async def first(self):
        return _Row(sample_id=self.samples[0]) if self.samples else None


@pytest.mark.asyncio
async def test_only_the_first_try_at_a_step_today_is_an_answer_given_alone():
    from app.voice.lesson_store import answered_alone

    database = _Turns(["first", "second"])
    meta = {"plan_id": "p", "event_id": "assess", "prompt_id": "plan.p.assess"}
    at = 1_790_000_000_000
    assert await answered_alone(database, "owner", meta, "first", at)
    assert not await answered_alone(database, "owner", meta, "second", at)
    first_ms, last_ms = database.bound[3], database.bound[4]
    assert first_ms <= at < last_ms and last_ms - first_ms == 24 * 3600 * 1000


@pytest.mark.asyncio
async def test_a_list_asked_again_from_where_it_broke_is_not_an_answer_given_alone():
    from app.voice.lesson_store import answered_alone

    meta = {
        "plan_id": "p",
        "event_id": "practice",
        "prompt_id": "repair.p.practice.friday",
    }
    assert not await answered_alone(
        _Turns(["first"]), "owner", meta, "first", 1_790_000_000_000
    )

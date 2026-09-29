"""Removing a learner, or the account, forgets their voice lessons too: the
D1 rows kept under their key, their recordings, and the tutor's memory."""

from urllib.parse import quote

import pytest
from signed_in import UID, added, chosen, client, signed_in
from voice_worker import Bucket, voice_app, worker_env

from app.voice.keeping import BoundVoice

T2 = "mathematics.multiplication.table-2"
METADATA = {
    "speaker_id": "s1",
    "language_pair": "yo-en",
    "task": "reasoning",
    "topic": "multiplication",
    "consent": {"granted": True},
    "prompt_id": "mul_fact_2x7_answer",
    "spoken_language": "en",
    "learner_class": "primary_3",
    "plan_id": T2,
    "event_id": "assess",
}
TABLES = {
    "samples": "SELECT owner_id FROM samples",
    "tutoring_turns": (
        "SELECT s.owner_id FROM tutoring_turns t JOIN samples s ON s.id = t.sample_id"
    ),
    "lesson_offers": "SELECT owner_id FROM lesson_offers",
    "lesson_events": "SELECT owner_id FROM lesson_events",
}


@pytest.fixture
def env(monkeypatch):
    async def transcribe(*_):
        return "fourteen", 40

    monkeypatch.setattr(
        "app.voice.worker_evaluation.transcribe_intron_sync", transcribe
    )
    return worker_env()


@pytest.fixture
def app(monkeypatch, env):
    return voice_app(monkeypatch, env)


def key(learner_id: str) -> str:
    return f"account:{UID}/{learner_id}"


async def taught(http, env, learner_id: str, recordings: int) -> None:
    """A lesson step offered and heard, marked recordings, and one still waiting to be marked."""
    await chosen(http, learner_id)
    lesson = await http.get("/api/voice/lesson", params={"learner_class": "primary_3"})
    move = lesson.json()["move"]
    await http.post(
        "/api/voice/lesson/events",
        json={"plan_id": move["plan_id"], "event_id": move["event_id"]},
    )
    env.DB.db.execute(
        "INSERT INTO lesson_offers (owner_id, plan_id, event_id, issued_at) "
        "VALUES (?, ?, 'assess', 0)",
        (key(learner_id), T2),
    )
    for n in range(recordings + 1):
        sample = (
            await http.post(
                "/api/voice/samples",
                json=METADATA,
                headers={"Idempotency-Key": f"k{n}"},
            )
        ).json()
        await http.put(
            sample["upload_path"],
            content=b"RIFF",
            headers={"Content-Type": "audio/wav"},
        )
        if n == recordings:
            break
        marked = await http.post(f"/api/voice/samples/{sample['sample_id']}/evaluation")
        assert marked.status_code == 200, marked.text


def kept(env, learner_id: str) -> dict:
    owner = key(learner_id)
    rows = {
        table: sum(row["owner_id"] == owner for row in env.DB.rows(sql))
        for table, sql in TABLES.items()
    }
    prefix = f"learners/{quote(owner, safe='')}/"
    rows["recordings"] = sum(k.startswith(prefix) for k in env.AUDIO.objects)
    return rows


async def two_learners(http, env) -> tuple[str, str]:
    await signed_in(http, firebaseIdToken="good")
    ada, bo = await added(http, "Ada"), await added(http, "Bo")
    await taught(http, env, ada, recordings=3)
    await signed_in(http, firebaseIdToken="good")
    await taught(http, env, bo, recordings=1)
    await signed_in(http, firebaseIdToken="good")
    return ada, bo


async def test_removing_a_learner_forgets_their_voice_lessons_and_no_one_elses(
    app, env
):
    async with client(app) as http:
        ada, bo = await two_learners(http, env)
        before = kept(env, ada), kept(env, bo)
        removed = await http.delete(f"/api/account/learners/{ada}")

    assert removed.status_code == 200
    assert before[0] == {
        "samples": 4,
        "tutoring_turns": 3,
        "lesson_offers": 2,
        "lesson_events": 1,
        "recordings": 1,
    }
    assert kept(env, ada) == dict.fromkeys(before[0], 0)
    assert kept(env, bo) == before[1]
    assert env.TUTOR.actions(key(ada))[-1] == "forget"
    assert "forget" not in env.TUTOR.actions(key(bo))
    assert (
        env.DB.rows(
            "SELECT * FROM tutoring_turns WHERE sample_id NOT IN (SELECT id FROM samples)"
        )
        == []
    )


async def test_deleting_the_account_forgets_every_learners_voice_lessons(app, env):
    async with client(app) as http:
        ada, bo = await two_learners(http, env)
        deleted = await http.delete("/api/account")

    assert deleted.status_code == 204
    for learner_id in (ada, bo):
        assert set(kept(env, learner_id).values()) == {0}
        assert env.TUTOR.actions(key(learner_id))[-1] == "forget"
    assert env.AUDIO.objects == {}


async def test_forgetting_pages_through_the_recordings_listing():
    env = worker_env()
    prefix = "learners/account%3Auid%2Fa1/"
    for n in range(2 * Bucket.PAGE + 1):
        env.AUDIO.objects[f"{prefix}samples/gvm_{n}.wav"] = b"RIFF"
    env.AUDIO.objects["learners/account%3Auid%2Fa2/samples/gvm_9.wav"] = b"RIFF"

    await BoundVoice(env).forget("account:uid/a1")

    assert list(env.AUDIO.objects) == ["learners/account%3Auid%2Fa2/samples/gvm_9.wav"]
    assert env.TUTOR.actions("account:uid/a1") == ["forget"]


async def test_without_the_workers_bindings_there_is_nothing_to_forget(monkeypatch):
    async with client(voice_app(monkeypatch, env=None)) as http:
        await signed_in(http, firebaseIdToken="good")
        ada = await added(http, "Ada")
        removed = await http.delete(f"/api/account/learners/{ada}")

    assert removed.status_code == 200

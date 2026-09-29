"""A child's recording stays until its turn has ended, and then the parent's consent decides: without
it the recording is deleted at once; with it, it is kept until the days the parent chose have passed.
Whatever happens, a recording nobody settled is gone after a day."""

import time

import pytest
from signed_in import client
from test_voice_routes import ADA, WAV, Clock, as_device, created, offered, uploaded
from voice_worker import voice_app, worker_env

from app.account.consents import DAY_MS
from app.voice.exercises import MAX_TURN_ATTEMPTS, PROCESSING_LEASE_MS, RETRY_AFTER_MS
from app.voice.recording_retention import (
    PAGE,
    UNDECIDED_KEPT_MS,
    settle_audio,
    sweep_audio,
)
from app.voice.speech.intron_sync import NoSpeechError


@pytest.fixture
def env():
    return worker_env()


@pytest.fixture
def app(monkeypatch, env):
    return voice_app(monkeypatch, env)


def _now_ms() -> int:
    return int(time.time() * 1000)


def agree(env, days: int = 30, learner: str = ADA) -> None:
    env.DB.db.execute(
        "INSERT INTO consents (learner_key, account_uid, scope, notice_version, "
        "retention_days, granted_at) VALUES (?, 'uid123', 'recordings', 1, ?, 0)",
        (learner, days),
    )


def withdraw(env, learner: str = ADA) -> None:
    env.DB.db.execute(
        "UPDATE consents SET revoked_at = 1 WHERE learner_key = ? "
        "AND scope = 'recordings' AND revoked_at IS NULL",
        (learner,),
    )


def evaluation(sample: dict) -> str:
    return f"/api/voice/samples/{sample['sample_id']}/evaluation"


def audio_row(env, sample: dict) -> dict:
    [row] = env.DB.rows(
        "SELECT audio_deleted_at, expires_at FROM samples WHERE id = ?",
        sample["sample_id"],
    )
    return row


def transcribing(monkeypatch, heard: list, words: str = "fourteen") -> None:
    async def transcribe(audio, *_):
        heard.append(bytes(audio))
        return words, 40

    monkeypatch.setattr(
        "app.voice.worker_evaluation.transcribe_intron_sync", transcribe
    )


def failing(monkeypatch, heard: list, error: Exception) -> None:
    async def transcribe(audio, *_):
        heard.append(bytes(audio))
        raise error

    monkeypatch.setattr(
        "app.voice.worker_evaluation.transcribe_intron_sync", transcribe
    )


def stored(env, sample_id: str, **columns) -> str:
    """A sample whose recording is in the bucket. `turn` is the (state, attempts) it has, if any."""
    turn = columns.pop("turn", None)
    key = f"learners/{ADA}/samples/{sample_id}.wav"
    env.AUDIO.objects[key] = WAV
    values = {"uploaded_at": 0, "expires_at": None, **columns}
    env.DB.db.execute(
        "INSERT INTO samples (id, owner_id, idempotency_key, metadata_fingerprint, "
        "state, metadata_json, created_at, audio_key, uploaded_at, expires_at) "
        "VALUES (?, ?, ?, 'f', 'ready', '{}', 0, ?, ?, ?)",
        (
            sample_id,
            ADA,
            sample_id,
            key,
            values["uploaded_at"],
            values["expires_at"],
        ),
    )
    if turn is not None:
        state, attempts = turn
        done = (
            "'x', 'correct', 'x', 'intron_sync', 1"
            if state == "complete"
            else "NULL, NULL, NULL, NULL, NULL"
        )
        env.DB.db.execute(
            "INSERT INTO tutoring_turns (sample_id, state, attempts, updated_at, "
            "transcript, decision, feedback, provider, latency_ms) "
            f"VALUES (?, ?, ?, 0, {done})",
            (sample_id, state, attempts),
        )
    return key


def deleted_ids(env) -> list[str]:
    rows = env.DB.rows(
        "SELECT id FROM samples WHERE audio_deleted_at IS NOT NULL ORDER BY id"
    )
    return [row["id"] for row in rows]


async def test_without_consent_a_marked_recording_is_deleted_and_the_result_kept(
    app, env, monkeypatch
):
    heard = []
    transcribing(monkeypatch, heard)
    offered(env, ADA)
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        assert len(env.AUDIO.objects) == 1
        marked = await http.post(evaluation(sample))

    assert marked.status_code == 200 and marked.json()["decision"] == "correct"
    assert heard == [WAV]
    assert env.AUDIO.objects == {}
    row = audio_row(env, sample)
    assert row["audio_deleted_at"] is not None and row["expires_at"] is None
    [turn] = env.DB.rows("SELECT state, transcript, decision FROM tutoring_turns")
    assert turn == {
        "state": "complete",
        "transcript": "fourteen",
        "decision": "correct",
    }


@pytest.mark.parametrize("days", [30, 90, 365])
async def test_with_consent_a_marked_recording_is_kept_for_the_days_chosen(
    app, env, monkeypatch, days
):
    transcribing(monkeypatch, [])
    offered(env, ADA)
    agree(env, days)
    before = _now_ms()
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        marked = await http.post(evaluation(sample))
    after = _now_ms()

    assert marked.status_code == 200
    assert len(env.AUDIO.objects) == 1
    row = audio_row(env, sample)
    assert row["audio_deleted_at"] is None
    assert before + days * DAY_MS <= row["expires_at"] <= after + days * DAY_MS


async def test_consent_of_another_learner_keeps_nothing(app, env, monkeypatch):
    transcribing(monkeypatch, [])
    offered(env, ADA)
    agree(env, 30, learner="someone-else")
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        await http.post(evaluation(sample))

    assert env.AUDIO.objects == {}


async def test_a_consent_to_use_graspy_alone_keeps_no_recording(app, env, monkeypatch):
    transcribing(monkeypatch, [])
    offered(env, ADA)
    env.DB.db.execute(
        "INSERT INTO consents (learner_key, account_uid, scope, notice_version, "
        "retention_days, granted_at) VALUES (?, 'uid123', 'service', 1, NULL, 0)",
        (ADA,),
    )
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        await http.post(evaluation(sample))

    assert env.AUDIO.objects == {}


async def test_a_consent_withdrawn_earlier_keeps_nothing(app, env, monkeypatch):
    transcribing(monkeypatch, [])
    offered(env, ADA)
    agree(env)
    withdraw(env)
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        await http.post(evaluation(sample))

    assert env.AUDIO.objects == {}


async def test_a_consent_withdrawn_while_the_recording_is_being_marked_wins(
    app, env, monkeypatch
):
    async def transcribe(audio, *_):
        withdraw(env)
        return "fourteen", 40

    monkeypatch.setattr(
        "app.voice.worker_evaluation.transcribe_intron_sync", transcribe
    )
    offered(env, ADA)
    agree(env)
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        marked = await http.post(evaluation(sample))

    assert marked.status_code == 200
    assert env.AUDIO.objects == {}
    assert audio_row(env, sample)["expires_at"] is None


async def test_a_consent_given_while_the_recording_is_being_marked_keeps_it(
    app, env, monkeypatch
):
    async def transcribe(audio, *_):
        agree(env)
        return "fourteen", 40

    monkeypatch.setattr(
        "app.voice.worker_evaluation.transcribe_intron_sync", transcribe
    )
    offered(env, ADA)
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        await http.post(evaluation(sample))

    assert len(env.AUDIO.objects) == 1
    assert audio_row(env, sample)["expires_at"] is not None


async def test_asking_again_after_a_recording_was_kept_does_not_delete_it(
    app, env, monkeypatch
):
    transcribing(monkeypatch, [])
    offered(env, ADA)
    agree(env)
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        await http.post(evaluation(sample))
        withdraw(env)
        again = await http.post(evaluation(sample))

    assert again.status_code == 200
    assert len(env.AUDIO.objects) == 1
    assert audio_row(env, sample)["audio_deleted_at"] is None


async def test_a_marked_turn_asked_for_again_answers_with_its_result_without_the_audio(
    app, env, monkeypatch
):
    """The answer may not have reached the phone; the result is there though the audio is not."""
    heard = []
    transcribing(monkeypatch, heard)
    offered(env, ADA)
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        first = await http.post(evaluation(sample))
        again = await http.post(evaluation(sample))
        late_upload = await http.put(
            sample["upload_path"], content=WAV, headers={"Content-Type": "audio/wav"}
        )

    assert again.status_code == 200 and again.json() == first.json()
    assert late_upload.status_code == 200
    assert heard == [WAV]
    assert env.AUDIO.objects == {}


async def test_a_recording_that_holds_no_speech_is_deleted_and_not_tried_again(
    app, env, monkeypatch
):
    heard = []
    failing(monkeypatch, heard, NoSpeechError("no speech"))
    offered(env, ADA)
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        silent = await http.post(evaluation(sample))
        again = await http.post(evaluation(sample))

    assert silent.status_code == 422 and silent.json()["code"] == "no_speech"
    assert again.status_code == 409 and again.json()["code"] == "marking_failed"
    assert len(heard) == 1
    assert env.AUDIO.objects == {}
    assert audio_row(env, sample)["audio_deleted_at"] is not None


async def test_a_recording_stays_for_every_attempt_and_is_settled_after_the_last(
    app, env, monkeypatch
):
    heard = []
    failing(monkeypatch, heard, RuntimeError("the recognizer failed"))
    clock = Clock()
    monkeypatch.setattr("app.voice.worker_evaluation.time", clock)
    offered(env, ADA)
    kept_after = []
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        for attempt in range(MAX_TURN_ATTEMPTS):
            clock.now += RETRY_AFTER_MS[attempt] / 1000 + 1
            assert (await http.post(evaluation(sample))).status_code == 502
            kept_after.append(len(env.AUDIO.objects))

    assert heard == [WAV] * MAX_TURN_ATTEMPTS
    assert kept_after == [1] * (MAX_TURN_ATTEMPTS - 1) + [0]
    assert audio_row(env, sample)["audio_deleted_at"] is not None


async def test_with_consent_a_recording_that_failed_for_good_is_kept(
    app, env, monkeypatch
):
    failing(monkeypatch, [], NoSpeechError("no speech"))
    offered(env, ADA)
    agree(env)
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        await http.post(evaluation(sample))

    assert len(env.AUDIO.objects) == 1
    assert audio_row(env, sample)["expires_at"] is not None


async def test_a_turn_cut_off_on_its_last_attempt_is_settled_when_asked_after(
    app, env, monkeypatch
):
    clock = Clock()
    monkeypatch.setattr("app.voice.worker_evaluation.time", clock)
    cut_off = round(clock.now * 1000) - PROCESSING_LEASE_MS - 1
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        env.DB.db.execute(
            "INSERT INTO tutoring_turns (sample_id, state, attempts, updated_at) "
            "VALUES (?, 'processing', ?, ?)",
            (sample["sample_id"], MAX_TURN_ATTEMPTS, cut_off),
        )
        refused = await http.post(evaluation(sample))

    assert refused.status_code == 409 and refused.json()["code"] == "marking_failed"
    assert env.AUDIO.objects == {}


async def test_a_recording_deleted_before_it_was_marked_is_not_ready_to_mark(
    app, env, monkeypatch
):
    heard = []
    transcribing(monkeypatch, heard)
    offered(env, ADA)
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        await sweep_audio(env, now_ms=_now_ms() + 2 * UNDECIDED_KEPT_MS)
        gone = await http.post(evaluation(sample))

    assert gone.status_code == 409 and gone.json()["code"] == "audio_not_ready"
    assert heard == [] and env.TUTOR.calls == []
    assert env.DB.rows("SELECT * FROM tutoring_turns") == []


async def test_a_delete_that_fails_does_not_fail_the_marking_and_the_sweep_finishes_it(
    app, env, monkeypatch
):
    transcribing(monkeypatch, [])
    offered(env, ADA)
    delete = env.AUDIO.delete

    async def broken(keys):
        raise RuntimeError("R2 is down")

    monkeypatch.setattr(env.AUDIO, "delete", broken)
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        marked = await http.post(evaluation(sample))
        assert audio_row(env, sample)["audio_deleted_at"] is None
        monkeypatch.setattr(env.AUDIO, "delete", delete)
        await sweep_audio(env)

    assert marked.status_code == 200
    assert env.TUTOR.actions(ADA) == ["teach", "record"]
    assert env.AUDIO.objects == {}
    assert audio_row(env, sample)["audio_deleted_at"] is not None


async def test_the_sweep_deletes_what_is_due_and_keeps_the_rest():
    env = worker_env()
    now = 10 * DAY_MS
    old, recent = now - UNDECIDED_KEPT_MS - 1, now - UNDECIDED_KEPT_MS + 60_000
    keys = [
        stored(env, "gvm_recent_unmarked", uploaded_at=recent),
        stored(env, "gvm_recent_retrying", uploaded_at=recent, turn=("failed", 1)),
        stored(env, "gvm_recent_marking", uploaded_at=recent, turn=("processing", 1)),
        stored(env, "gvm_kept", uploaded_at=old, expires_at=now + 1),
    ]
    stored(env, "gvm_old_unmarked", uploaded_at=old)
    stored(env, "gvm_old_retrying", uploaded_at=old, turn=("failed", 1))
    stored(env, "gvm_kept_expired", uploaded_at=old, expires_at=now)
    env.AUDIO.objects["teacher-audio/v3/en/prompt/x/spitch.ogg"] = b"OggS"

    swept = await sweep_audio(env, now_ms=now)

    assert swept == 3
    assert sorted(env.AUDIO.objects) == sorted(
        [*keys, "teacher-audio/v3/en/prompt/x/spitch.ogg"]
    )
    assert deleted_ids(env) == [
        "gvm_kept_expired",
        "gvm_old_retrying",
        "gvm_old_unmarked",
    ]
    assert await sweep_audio(env, now_ms=now) == 0


async def test_the_sweep_settles_a_turn_that_ended_without_being_settled():
    """The marking's own settling may have failed; each is decided as it would have been."""
    env = worker_env()
    now = _now_ms()
    stored(env, "gvm_marked", uploaded_at=now, turn=("complete", 1))
    stored(env, "gvm_spent", uploaded_at=now, turn=("failed", MAX_TURN_ATTEMPTS))
    stored(env, "gvm_retrying", uploaded_at=now, turn=("failed", 1))

    await sweep_audio(env, now_ms=now)

    assert deleted_ids(env) == ["gvm_marked", "gvm_spent"]

    agree(env, 90)
    stored(env, "gvm_marked_again", uploaded_at=now, turn=("complete", 1))
    await sweep_audio(env, now_ms=now)

    assert deleted_ids(env) == ["gvm_marked", "gvm_spent"]
    [kept] = env.DB.rows("SELECT expires_at FROM samples WHERE id = 'gvm_marked_again'")
    assert kept["expires_at"] >= now + 90 * DAY_MS


async def test_the_sweep_goes_on_past_one_page():
    env = worker_env()
    for n in range(PAGE + 5):
        stored(env, f"gvm_{n}", uploaded_at=0)

    assert await sweep_audio(env, now_ms=2 * DAY_MS) == PAGE + 5
    assert env.AUDIO.objects == {}


async def test_the_sweep_leaves_a_sample_whose_audio_never_arrived():
    env = worker_env()
    env.DB.db.execute(
        "INSERT INTO samples (id, owner_id, idempotency_key, metadata_fingerprint, "
        "state, metadata_json, created_at) VALUES ('gvm_wait', ?, 'k', 'f', "
        "'awaiting_audio', '{}', 0)",
        (ADA,),
    )

    assert await sweep_audio(env, now_ms=10 * DAY_MS) == 0


async def test_settling_one_recording_leaves_the_others_and_is_done_once():
    env = worker_env()
    stored(env, "gvm_a")
    second = stored(env, "gvm_b")

    await settle_audio(env, "gvm_a")
    await settle_audio(env, "gvm_a")

    assert list(env.AUDIO.objects) == [second]

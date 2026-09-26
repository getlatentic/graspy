"""The voice routes over stand-ins for the Worker's bindings: who may call
them, a recording from create to reply, and each learner's data kept apart."""

import pytest
from signed_in import client, signed_in, use
from voice_worker import voice_app, worker_env

from app.voice.speech.teacher_audio_contract import (
    audio_cache_key,
    audio_etag,
    audio_version,
    teacher_audio_route,
    teacher_utterance,
)

ADA = "0a1b2c3d4e5f60718293a4b5c6d7e8f9"
BO = "5555eeee6666ffff7777aaaa8888bbbb"
T2 = "mathematics.multiplication.table-2"
WAV = b"RIFF" + b"\0" * 60
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


@pytest.fixture
def env():
    return worker_env()


@pytest.fixture
def app(monkeypatch, env):
    return voice_app(monkeypatch, env)


async def as_device(http, device: str) -> None:
    await signed_in(http, deviceId=device)


async def created(http, metadata=METADATA, key="k-1") -> dict:
    response = await http.post(
        "/api/voice/samples", json=metadata, headers={"Idempotency-Key": key}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def uploaded(http, sample: dict, body: bytes = WAV) -> dict:
    response = await http.put(
        sample["upload_path"], content=body, headers={"Content-Type": "audio/wav"}
    )
    assert response.status_code == 200, response.text
    return response.json()


def offered(env, learner: str, plan_id: str = T2, event_id: str = "assess") -> None:
    env.DB.db.execute(
        "INSERT INTO lesson_offers (owner_id, plan_id, event_id, issued_at) "
        "VALUES (?, ?, ?, 0)",
        (learner, plan_id, event_id),
    )


async def test_a_request_without_a_session_is_refused(app):
    async with client(app) as http:
        response = await http.get("/api/voice/lesson")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "session_required"


async def test_an_account_session_chooses_a_learner_first(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        response = await http.get("/api/voice/lesson")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "learner_required"


async def test_without_the_workers_bindings_voice_is_unavailable(monkeypatch):
    async with client(voice_app(monkeypatch, env=None)) as http:
        await as_device(http, ADA)
        response = await http.get("/api/voice/lesson")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "voice_unavailable"


async def test_a_new_learner_is_offered_the_first_step_and_hears_only_that(app, env):
    async with client(app) as http:
        await as_device(http, ADA)
        lesson = await http.get(
            "/api/voice/lesson", params={"learner_class": "primary_1"}
        )
        move = lesson.json()["move"]
        heard = await http.post(
            "/api/voice/lesson/events",
            json={"plan_id": move["plan_id"], "event_id": move["event_id"]},
        )
        skipped = await http.post(
            "/api/voice/lesson/events",
            json={"plan_id": move["plan_id"], "event_id": "assess"},
        )
        board = await http.get(
            "/api/voice/catalogue", params={"learner_class": "primary_1"}
        )

    assert move["event_id"] == "attention"
    assert heard.status_code == 200
    assert skipped.status_code == 409
    assert skipped.json()["code"] == "step_not_offered"
    assert env.DB.rows("SELECT owner_id, event_id FROM lesson_events") == [
        {"owner_id": ADA, "event_id": "attention"}
    ]
    assert env.TUTOR.actions(ADA) == ["sitting", "sitting"]
    assert [row["current"] for row in board.json()["lessons"]].count(True) == 1


async def test_a_create_is_idempotent_on_its_key(app, env):
    async with client(app) as http:
        await as_device(http, ADA)
        first = await created(http)
        again = await http.post(
            "/api/voice/samples", json=METADATA, headers={"Idempotency-Key": "k-1"}
        )
        changed = await http.post(
            "/api/voice/samples",
            json={**METADATA, "speaker_id": "s2"},
            headers={"Idempotency-Key": "k-1"},
        )
        keyless = await http.post("/api/voice/samples", json=METADATA)

    assert first["state"] == "awaiting_audio"
    assert first["upload_path"] == f"/api/voice/samples/{first['sample_id']}/audio"
    assert again.status_code == 200 and again.json() == first
    assert changed.status_code == 409
    assert changed.json()["code"] == "idempotency_conflict"
    assert keyless.status_code == 400
    assert keyless.json() == {"detail": "Idempotency-Key is required"}
    assert len(env.DB.rows("SELECT id FROM samples")) == 1


@pytest.mark.parametrize(
    ("change", "detail"),
    [
        ({"consent": {"granted": False}}, "recording consent is required"),
        ({"consent": "yes"}, "recording consent is required"),
        ({"language_pair": "en-en"}, "language_pair must be yo-en or pcm-en"),
        ({"event_id": None}, "plan_id and event_id come together"),
    ],
)
async def test_a_recording_is_refused_without_what_it_needs(app, change, detail):
    async with client(app) as http:
        await as_device(http, ADA)
        response = await http.post(
            "/api/voice/samples",
            json={**METADATA, **change},
            headers={"Idempotency-Key": "k-1"},
        )

    assert response.status_code == 400
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize(
    ("event_id", "prompt_id", "status"),
    [
        ("assess", "mul_fact_2x7_answer", 201),
        ("practice", "mul_fact_2x3_answer", 201),
        ("practice", "mul_fact_3x3_answer", 400),
        ("attention", "mul_fact_2x7_answer", 400),
        ("nonesuch", "mul_fact_2x7_answer", 400),
    ],
)
async def test_a_recording_names_only_an_event_that_asks_its_prompt(
    app, event_id, prompt_id, status
):
    """A recited table may be answered one fact at a time, and nothing else."""
    async with client(app) as http:
        await as_device(http, ADA)
        response = await http.post(
            "/api/voice/samples",
            json={**METADATA, "event_id": event_id, "prompt_id": prompt_id},
            headers={"Idempotency-Key": "k-1"},
        )

    assert response.status_code == status, response.text


async def test_the_recording_is_kept_under_the_learners_own_prefix(app, env):
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        done = await uploaded(http, sample)
        again = await uploaded(http, sample, b"RIFF-a-second-body")

    key = f"learners/{ADA}/samples/{sample['sample_id']}.wav"
    assert done == again == {"sample_id": sample["sample_id"], "state": "ready"}
    assert env.AUDIO.objects == {key: WAV}
    assert env.AUDIO.types[key] == "audio/wav"
    [row] = env.DB.rows("SELECT state, audio_key, audio_bytes FROM samples")
    assert row == {"state": "ready", "audio_key": key, "audio_bytes": len(WAV)}


@pytest.mark.parametrize(
    ("headers", "status"),
    [
        ({"Content-Type": "text/plain"}, 415),
        ({"Content-Type": "audio/mpeg"}, 415),
        ({"Content-Type": "audio/wav", "Content-Length": "0"}, 411),
        (
            {"Content-Type": "audio/wav", "Content-Length": str(10 * 1024 * 1024 + 1)},
            413,
        ),
    ],
)
async def test_an_upload_is_wav_or_ogg_and_at_most_ten_mebibytes(
    app, env, headers, status
):
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        response = await http.put(
            sample["upload_path"],
            content=b"" if "Content-Length" in headers else WAV,
            headers=headers,
        )

    assert response.status_code == status
    assert env.AUDIO.objects == {}


async def test_ogg_is_kept_as_ogg(app, env):
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        response = await http.put(
            sample["upload_path"],
            content=b"OggS",
            headers={"Content-Type": "audio/ogg; codecs=opus"},
        )

    assert response.status_code == 200
    assert list(env.AUDIO.objects) == [
        f"learners/{ADA}/samples/{sample['sample_id']}.ogg"
    ]


async def test_one_learner_cannot_reach_anothers_recording(app, env, monkeypatch):
    """Ada's recording is marked and has a reply; Bo reaches none of it."""

    async def transcribe(*_):
        return "fourteen", 40

    async def speak(*_):
        return b"OggS", "audio/ogg", "made"

    monkeypatch.setattr(
        "app.voice.worker_evaluation.transcribe_intron_sync", transcribe
    )
    monkeypatch.setattr("app.voice.speech.reply_audio.speak", speak)
    offered(env, ADA)
    async with client(app) as http:
        ada = await signed_in(http, deviceId=ADA)
        sample = await created(http)
        await uploaded(http, sample)
        path = f"/api/voice/samples/{sample['sample_id']}"
        assert (await http.post(f"{path}/evaluation")).status_code == 200
        await signed_in(http, deviceId=BO)
        upload = await http.put(
            f"{path}/audio", content=WAV, headers={"Content-Type": "audio/wav"}
        )
        evaluation = await http.post(f"{path}/evaluation")
        reply = await http.get(f"{path}/reply-audio")
        use(http, ada)
        own = await http.get(f"{path}/reply-audio")

    assert (upload.status_code, evaluation.status_code, reply.status_code) == (
        404,
        404,
        404,
    )
    assert own.status_code == 200
    assert env.TUTOR.actions(BO) == []


async def test_a_recording_may_answer_only_a_step_the_learner_was_offered(
    app, env, monkeypatch
):
    heard = []

    async def transcribe(*args):
        heard.append(args)
        return "fourteen", 40

    monkeypatch.setattr(
        "app.voice.worker_evaluation.transcribe_intron_sync", transcribe
    )
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        refused = await http.post(
            f"/api/voice/samples/{sample['sample_id']}/evaluation"
        )

    assert refused.status_code == 409
    assert refused.json() == {
        "detail": "that step was not offered to this learner",
        "code": "step_not_offered",
    }
    assert heard == [] and env.TUTOR.calls == []
    assert env.DB.rows("SELECT * FROM tutoring_turns") == []


async def test_an_offered_step_is_marked_remembered_and_answered_aloud(
    app, env, monkeypatch
):
    async def transcribe(audio, language, api_key, file_name):
        assert (audio, language, api_key) == (WAV, "en", "intron-test")
        return "fourteen", 40

    async def speak(_env, text, language, api_key, audio_format):
        assert (text, language, api_key) == ("Well done.", "en", "spitch-test")
        assert audio_format == "ogg"
        return b"OggS-reply", "audio/ogg", "made"

    monkeypatch.setattr(
        "app.voice.worker_evaluation.transcribe_intron_sync", transcribe
    )
    monkeypatch.setattr("app.voice.speech.reply_audio.speak", speak)
    offered(env, ADA)
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
        path = f"/api/voice/samples/{sample['sample_id']}"
        marked = await http.post(f"{path}/evaluation")
        again = await http.post(f"{path}/evaluation")
        reply = await http.get(f"{path}/reply-audio")

    assert marked.status_code == 200, marked.text
    turn = marked.json()
    assert turn["decision"] == "correct" and turn["feedback"] == "Well done."
    assert turn["parsed_answer"] == 14 and turn["provider"] == "intron_sync"
    assert turn["exercise"] == {"kind": "fact_answer", "table": 2, "multiplier": 7}
    assert again.json() == turn
    sent = {action: body for _, action, body in env.TUTOR.calls}
    assert [action for _, action, _ in env.TUTOR.calls] == ["teach", "record", "record"]
    teach, record = sent["teach"], sent["record"]
    assert teach["lesson"] == T2 and teach["ask"]["heard"] == "fourteen"
    assert record == {
        "lesson": "primary_3",
        "item": T2,
        "verdict": "correct",
        "turn": sample["sample_id"],
    }
    assert reply.status_code == 200 and reply.content == b"OggS-reply"
    assert reply.headers["cache-control"] == "private, max-age=31536000, immutable"


async def test_a_phone_holding_the_current_line_hears_304(app, env):
    route = teacher_audio_route(teacher_utterance("prompt", "en"))
    etag = audio_etag(audio_version(route))
    async with client(app) as http:
        await as_device(http, ADA)
        fresh = await http.get(
            "/api/voice/teacher-audio/prompt",
            params={"language": "en"},
            headers={"If-None-Match": etag},
        )
        unknown = await http.get(
            "/api/voice/teacher-audio/say-anything", params={"language": "en"}
        )

    assert fresh.status_code == 304 and fresh.content == b""
    assert fresh.headers["etag"] == etag
    assert fresh.headers["cache-control"] == "private, no-cache"
    assert unknown.status_code == 404


async def test_a_browser_that_cannot_play_opus_hears_the_line_as_mp3(app, env):
    route = teacher_audio_route(teacher_utterance("prompt", "en"), "mp3")
    await env.AUDIO.put(audio_cache_key("prompt", "en", route), b"ID3-line")
    async with client(app) as http:
        await as_device(http, ADA)
        line = await http.get(
            "/api/voice/teacher-audio/prompt",
            params={"language": "en", "format": "mp3"},
        )
        refused = await http.get(
            "/api/voice/teacher-audio/prompt",
            params={"language": "en", "format": "wav"},
        )

    assert line.status_code == 200 and line.content == b"ID3-line"
    assert line.headers["content-type"] == "audio/mpeg"
    assert refused.status_code == 422


async def test_a_malformed_sample_id_never_reaches_the_database(app):
    async with client(app) as http:
        await as_device(http, ADA)
        response = await http.post("/api/voice/samples/not-a-sample/evaluation")

    assert response.status_code == 422


def test_the_learners_prefix_quotes_the_key_whole():
    from app.voice.keeping import recordings_prefix

    assert recordings_prefix("account:uid/a1") == "learners/account%3Auid%2Fa1/"
    assert not recordings_prefix("account:uid/a1").startswith(
        recordings_prefix("account:uid")
    )


def test_the_moved_handlers_answer_with_starlette_responses():
    """workers.Response cannot be returned from a FastAPI route."""
    from pathlib import Path

    voice = Path(__file__).parents[1] / "src" / "app" / "voice"
    sources = [path.read_text() for path in voice.rglob("*.py")]
    assert not any("from workers import Response" in source for source in sources)

"""An upload puts the audio and then updates the sample's row. When the update never happens, the
audio is still in the bucket under a row that names no key, and nothing used to find it. The sweep
deletes what an upload put when it began a day ago and never finished."""

import time

import httpx2
import pytest
from signed_in import client
from test_voice_routes import ADA, BO, WAV, as_device, created, uploaded
from voice_worker import voice_app, worker_env

from app.account.consents import DAY_MS
from app.voice.keeping import AUDIO_EXTENSIONS, possible_audio_keys, sample_audio_key
from app.voice.recording_retention import UNDECIDED_KEPT_MS, sweep_audio
from app.voice.samples import AUDIO_TYPES, UPLOADED_SQL


@pytest.fixture
def env():
    return worker_env()


@pytest.fixture
def app(monkeypatch, env):
    return voice_app(monkeypatch, env)


def _now_ms() -> int:
    return int(time.time() * 1000)


def sample_row(env, sample: dict) -> dict:
    [row] = env.DB.rows(
        "SELECT state, audio_key, upload_started_at FROM samples WHERE id = ?",
        sample["sample_id"],
    )
    return row


def a_day_later() -> int:
    return _now_ms() + UNDECIDED_KEPT_MS + 1_000


async def put_and_fail(app, monkeypatch, content_type: str = "audio/wav") -> dict:
    """An upload that puts the audio and dies when its row is updated."""
    monkeypatch.setattr(
        "app.voice.samples.UPLOADED_SQL",
        "UPDATE samples SET no_such_column = 1 WHERE id = ?1 AND owner_id = ?2 "
        "AND ?3 = ?3 AND ?4 = ?4 AND ?5 = ?5 AND ?6 = ?6",
    )
    transport = httpx2.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx2.AsyncClient(transport=transport, base_url="http://test") as http:
        await as_device(http, ADA)
        sample = await created(http)
        response = await http.put(
            sample["upload_path"], content=WAV, headers={"Content-Type": content_type}
        )
    assert response.status_code == 500
    return sample


def test_every_upload_type_has_a_key_the_sweep_knows():
    extensions = {"ogg" if kind == "audio/ogg" else "wav" for kind in AUDIO_TYPES}

    assert extensions <= set(AUDIO_EXTENSIONS)
    assert possible_audio_keys(ADA, "gvm_1") == [
        sample_audio_key(ADA, "gvm_1", extension) for extension in AUDIO_EXTENSIONS
    ]


@pytest.mark.parametrize(
    ("content_type", "extension"), [("audio/wav", "wav"), ("audio/ogg", "ogg")]
)
async def test_audio_put_by_an_upload_that_never_finished_is_deleted_after_a_day(
    app, env, monkeypatch, content_type, extension
):
    sample = await put_and_fail(app, monkeypatch, content_type)
    key = sample_audio_key(ADA, sample["sample_id"], extension)
    assert list(env.AUDIO.objects) == [key]
    row = sample_row(env, sample)
    assert row["state"] == "awaiting_audio" and row["upload_started_at"] is not None

    assert await sweep_audio(env, _now_ms() + DAY_MS - 60_000) == 0
    assert list(env.AUDIO.objects) == [key]

    assert await sweep_audio(env, a_day_later()) == 1
    assert env.AUDIO.objects == {}
    assert sample_row(env, sample)["upload_started_at"] is None
    assert await sweep_audio(env, a_day_later()) == 0


async def test_a_sample_whose_upload_never_began_is_left(app, env):
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)

    assert await sweep_audio(env, 10 * DAY_MS + _now_ms()) == 0
    row = sample_row(env, sample)
    assert row["state"] == "awaiting_audio" and row["upload_started_at"] is None


async def test_a_phone_that_comes_back_later_can_still_upload(app, env, monkeypatch):
    sample = await put_and_fail(app, monkeypatch)
    await sweep_audio(env, a_day_later())
    monkeypatch.setattr("app.voice.samples.UPLOADED_SQL", UPLOADED_SQL)

    async with client(app) as http:
        await as_device(http, ADA)
        again = await uploaded(http, sample)

    assert again["state"] == "ready"
    assert list(env.AUDIO.objects) == [
        sample_audio_key(ADA, sample["sample_id"], "wav")
    ]
    assert sample_row(env, sample)["state"] == "ready"


async def test_a_newer_attempt_on_the_same_sample_is_not_cleared(app, env, monkeypatch):
    sample = await put_and_fail(app, monkeypatch)
    cutoff = _now_ms() + 60_000
    env.DB.db.execute(
        "UPDATE samples SET upload_started_at = ? WHERE id = ?",
        (cutoff + 1, sample["sample_id"]),
    )

    assert await sweep_audio(env, cutoff + UNDECIDED_KEPT_MS) == 0
    assert sample_row(env, sample)["upload_started_at"] == cutoff + 1


async def test_a_finished_upload_is_not_this_sweeps_to_delete(app, env):
    async with client(app) as http:
        await as_device(http, ADA)
        sample = await created(http)
        await uploaded(http, sample)
    key = sample_audio_key(ADA, sample["sample_id"], "wav")

    # Undecided, and a day old: the older sweep deletes it, once.
    assert await sweep_audio(env, a_day_later()) == 1
    assert key not in env.AUDIO.objects
    assert sample_row(env, sample)["state"] == "ready"


async def test_another_learners_audio_is_not_touched(app, env, monkeypatch):
    await put_and_fail(app, monkeypatch)
    other = sample_audio_key(BO, "gvm_other", "wav")
    env.AUDIO.objects[other] = WAV

    await sweep_audio(env, a_day_later())

    assert list(env.AUDIO.objects) == [other]


async def test_a_sweep_page_deletes_every_stalled_sample_it_names(
    app, env, monkeypatch
):
    monkeypatch.setattr(
        "app.voice.samples.UPLOADED_SQL",
        "UPDATE samples SET no_such_column = 1 WHERE id = ?1 AND owner_id = ?2 "
        "AND ?3 = ?3 AND ?4 = ?4 AND ?5 = ?5 AND ?6 = ?6",
    )
    transport = httpx2.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx2.AsyncClient(transport=transport, base_url="http://test") as http:
        await as_device(http, ADA)
        for number in range(3):
            sample = await created(http, key=f"k-{number}")
            await http.put(
                sample["upload_path"],
                content=WAV,
                headers={"Content-Type": "audio/wav"},
            )
    assert len(env.AUDIO.objects) == 3

    assert await sweep_audio(env, a_day_later()) == 3
    assert env.AUDIO.objects == {}

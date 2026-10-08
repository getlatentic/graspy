"""The teacher's voice for a lesson line and for her reply to one answer, run
against stand-ins for the Workers runtime's fetch, R2 and D1."""

import json
import sys
from types import ModuleType, SimpleNamespace

import pytest

from app.voice.speech.reply_audio import stream_reply_audio
from app.voice.speech.teacher_audio import stream_teacher_audio
from app.voice.speech.teacher_audio_contract import (
    audio_cache_key,
    audio_etag,
    audio_version,
    teacher_audio_route,
    teacher_audio_routes,
    teacher_utterance,
)

OGG = b"OggS-clip"


class Provider:
    """The Workers runtime's fetch, answering as the voice provider would."""

    def __init__(self, status=200, audio=OGG):
        self.status, self.audio, self.calls = status, audio, []

    async def __call__(self, url, **options):
        self.calls.append((url, json.loads(options["body"])))

        async def body():
            return memoryview(self.audio)

        return SimpleNamespace(status=self.status, bytes=body)


@pytest.fixture
def provider(monkeypatch):
    provider = Provider()
    workers = ModuleType("workers")
    workers.fetch = provider
    js = ModuleType("js")
    js.AbortSignal = SimpleNamespace(timeout=lambda ms: ("timeout", ms))
    monkeypatch.setitem(sys.modules, "workers", workers)
    monkeypatch.setitem(sys.modules, "js", js)
    return provider


class Stored:
    def __init__(self, data: bytes):
        self.body = data

    async def bytes(self):
        return memoryview(self.body)


class Bucket:
    """The R2 binding."""

    def __init__(self, objects=None):
        self.objects, self.reads, self.puts = dict(objects or {}), [], []

    async def get(self, key):
        self.reads.append(key)
        found = self.objects.get(key)
        return None if found is None else Stored(found)

    async def put(self, key, data, httpMetadata=None):
        self.objects[key] = data
        self.puts.append((key, httpMetadata))


class Database:
    """The D1 binding, answering every query with one row."""

    def __init__(self, row):
        self.row, self.bound = row, None

    def prepare(self, _sql):
        return self

    def bind(self, *values):
        self.bound = values
        return self

    async def first(self):
        return self.row


def env(bucket=None, db=None):
    return SimpleNamespace(
        AUDIO=bucket or Bucket(), DB=db, SPITCH_API_KEY="spitch-test"
    )


def spitch_route(utterance_id: str, language: str):
    return teacher_audio_route(teacher_utterance(utterance_id, language))


def routes(utterance_id: str, language: str):
    return teacher_audio_routes(teacher_utterance(utterance_id, language))


async def test_a_phone_holding_the_current_line_is_answered_304_without_a_read(
    provider,
):
    bucket = Bucket()
    version = audio_version(spitch_route("prompt", "yo"))

    answer = await stream_teacher_audio(
        env(bucket), "prompt", "yo", audio_etag(version)
    )

    assert answer.status_code == 304
    assert answer.body == b""
    assert dict(answer.headers) == {
        "etag": audio_etag(version),
        "cache-control": "private, no-cache",
    }
    assert bucket.reads == [] and provider.calls == []


async def test_a_phone_holding_old_words_gets_the_kept_recording(provider):
    route = spitch_route("prompt", "yo")
    key = audio_cache_key("prompt", "yo", route)
    bucket = Bucket({key: b"OggS-kept"})

    answer = await stream_teacher_audio(env(bucket), "prompt", "yo", '"stale"')

    assert answer.status_code == 200
    assert answer.body == b"OggS-kept"
    assert answer.headers["ETag"] == audio_etag(audio_version(route))
    assert answer.headers["Content-Type"] == "audio/ogg"
    assert provider.calls == []


async def test_a_line_never_spoken_is_spoken_once_and_kept(provider):
    bucket = Bucket()
    route = spitch_route("feedback-correct", "pcm")

    answer = await stream_teacher_audio(env(bucket), "feedback-correct", "pcm", None)

    assert answer.body == OGG
    assert provider.calls == [("https://api.spitch.app/v1/speech", route.request)]
    assert bucket.puts == [
        (
            audio_cache_key("feedback-correct", "pcm", route),
            {"contentType": "audio/ogg"},
        )
    ]


async def test_a_failing_provider_asks_the_phone_to_come_back(provider):
    provider.status = 502

    answer = await stream_teacher_audio(env(), "prompt", "en", None)

    assert answer.status_code == 503
    assert answer.headers["Retry-After"] == "30"


async def test_an_unknown_line_is_not_found(provider):
    answer = await stream_teacher_audio(env(), "say-anything", "en", None)

    assert answer.status_code == 404
    assert provider.calls == []


async def test_the_reply_is_found_by_the_learner_and_spoken_in_the_lesson_language(
    provider,
):
    db = Database(
        {
            "feedback": "Ó dára. Méje ìlọ́po mẹ́jọ.",
            "metadata_json": json.dumps({"lesson_language": "yo"}),
        }
    )
    bucket = Bucket()

    answer = await stream_reply_audio(env(bucket, db), "account:u1/a1b2c3", "gvm_1")

    assert db.bound == ("gvm_1", "account:u1/a1b2c3")
    assert answer.body == OGG
    assert answer.headers["X-Graspy-Voice"] == "made"
    assert provider.calls[0][1]["voice"] == "sade"
    again = await stream_reply_audio(env(bucket, db), "account:u1/a1b2c3", "gvm_1")
    assert again.headers["X-Graspy-Voice"] == "kept"
    assert len(provider.calls) == 1


async def test_a_turn_without_a_reply_has_nothing_to_play(provider):
    answer = await stream_reply_audio(env(db=Database(None)), "d1", "gvm_1")

    assert answer.status_code == 404
    assert provider.calls == []


MP3 = b"ID3-idera"


async def test_an_english_line_recorded_in_idera_is_served_from_the_store_and_never_asked_for(
    provider,
):
    yarngpt, _ = routes("prompt", "en")
    bucket = Bucket({audio_cache_key("prompt", "en", yarngpt): MP3})

    answer = await stream_teacher_audio(env(bucket), "prompt", "en", None)

    assert answer.body == MP3
    assert answer.headers["Content-Type"] == "audio/mpeg"
    assert answer.headers["X-Graspy-Voice-Provider"] == "yarngpt"
    assert answer.headers["ETag"] == audio_etag(audio_version(yarngpt))
    assert provider.calls == []


async def test_a_phone_holding_the_idera_recording_is_answered_304_without_a_read(
    provider,
):
    yarngpt, _ = routes("prompt", "en")
    bucket = Bucket()

    answer = await stream_teacher_audio(
        env(bucket), "prompt", "en", audio_etag(audio_version(yarngpt))
    )

    assert answer.status_code == 304
    assert bucket.reads == [] and provider.calls == []


async def test_a_phone_holding_the_spitch_recording_is_given_idera_once_it_is_published(
    provider,
):
    yarngpt, spitch = routes("prompt", "en")
    bucket = Bucket(
        {
            audio_cache_key("prompt", "en", yarngpt): MP3,
            audio_cache_key("prompt", "en", spitch): OGG,
        }
    )

    answer = await stream_teacher_audio(
        env(bucket), "prompt", "en", audio_etag(audio_version(spitch))
    )

    assert (answer.status_code, answer.body) == (200, MP3)
    assert provider.calls == []


async def test_a_phone_holding_the_spitch_recording_keeps_it_until_idera_is_published(
    provider,
):
    _, spitch = routes("prompt", "en")
    bucket = Bucket({audio_cache_key("prompt", "en", spitch): OGG})

    answer = await stream_teacher_audio(
        env(bucket), "prompt", "en", audio_etag(audio_version(spitch))
    )

    assert answer.status_code == 304
    assert provider.calls == []


async def test_an_english_line_with_only_a_spitch_recording_serves_it(provider):
    _, spitch = routes("prompt", "en")
    bucket = Bucket({audio_cache_key("prompt", "en", spitch): b"OggS-kept"})

    answer = await stream_teacher_audio(env(bucket), "prompt", "en", None)

    assert (answer.body, answer.headers["Content-Type"]) == (b"OggS-kept", "audio/ogg")
    assert provider.calls == []


async def test_an_english_line_not_yet_recorded_is_spoken_by_spitch_within_the_turn_and_kept_under_its_key(
    provider,
):
    _, spitch = routes("feedback-correct", "en")
    bucket = Bucket()

    answer = await stream_teacher_audio(env(bucket), "feedback-correct", "en", None)

    assert answer.body == OGG
    assert provider.calls == [("https://api.spitch.app/v1/speech", spitch.request)]
    assert [key for key, _ in bucket.puts] == [
        audio_cache_key("feedback-correct", "en", spitch)
    ]


async def test_a_phone_holding_the_spitch_recording_of_a_line_nobody_kept_is_not_made_to_wait(
    provider,
):
    _, spitch = routes("prompt", "en")

    answer = await stream_teacher_audio(
        env(), "prompt", "en", audio_etag(audio_version(spitch))
    )

    assert answer.status_code == 304
    assert provider.calls == []

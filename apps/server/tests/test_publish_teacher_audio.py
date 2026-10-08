"""The script that records the teacher's English lines in YarnGPT, run against stand-ins for its network, store and clock."""

import io
import json
import runpy
import urllib.error
from pathlib import Path
from types import SimpleNamespace

import pytest

SCRIPT = runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "scripts/voice/publish_teacher_audio.py")
)
Yarn, Stop, Failed = SCRIPT["Yarn"], SCRIPT["Stop"], SCRIPT["Failed"]
publish, main, is_mp3 = SCRIPT["publish"], SCRIPT["main"], SCRIPT["is_mp3"]
lines_to_record = SCRIPT["lines_to_record"]

MP3 = b"ID3" + bytes(2048)


class Answer:
    def __init__(self, body: bytes):
        self.body = body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def refusal(code: int, retry_after: str | None = None):
    headers = {"Retry-After": retry_after} if retry_after else {}
    return urllib.error.HTTPError(
        "https://yarngpt.ai",
        code,
        "refused",
        SimpleNamespace(get=headers.get),
        io.BytesIO(b"{}"),
    )


class Network:
    """YarnGPT: `prepare` answers a ticket, and the ticket's URL answers the audio. `script` holds what to answer first instead."""

    def __init__(self, script=None, audio=MP3):
        self.script, self.audio, self.requests = list(script or []), audio, []

    def __call__(self, request, timeout):
        self.requests.append(
            (
                request.full_url,
                request.get_method(),
                dict(request.header_items()),
                request.data,
                timeout,
            )
        )
        if self.script:
            answer = self.script.pop(0)
            if isinstance(answer, Exception):
                raise answer
            return Answer(answer)
        if request.full_url.endswith("/tts/prepare"):
            return Answer(
                json.dumps(
                    {
                        "ticket": "t",
                        "stream_url": "/api/v1/tts/stream/t",
                        "expires_in": 300,
                    }
                ).encode()
            )
        return Answer(self.audio)


def yarn(network, sleeps=None):
    return Yarn(
        "secret-key",
        opener=network,
        sleep=(sleeps.append if sleeps is not None else (lambda _: None)),
    )


def test_an_mp3_has_a_tag_or_a_frame_header_and_is_long_enough_to_hold_speech():
    assert is_mp3(MP3) and is_mp3(b"\xff\xfb" + bytes(2048))
    assert not is_mp3(
        b'<?xml version="1.0"?><Error>InvalidRequest</Error>' + bytes(2048)
    )
    assert not is_mp3(b"ID3")


def test_a_recording_is_asked_for_at_prepare_and_fetched_from_its_ticket():
    network = Network()

    audio = yarn(network).record("Yes, ten! Very good.", "idera")

    assert audio == MP3
    (
        (prepare_url, method, headers, body, _),
        (stream_url, stream_method, stream_headers, *_),
    ) = network.requests
    assert (prepare_url, method) == ("https://yarngpt.ai/api/v1/tts/prepare", "POST")
    assert json.loads(body) == {"text": "Yes, ten! Very good.", "voice": "idera"}
    assert (
        headers["Authorization"] == "Bearer secret-key" and headers["Idempotency-key"]
    )
    assert (stream_url, stream_method) == (
        "https://yarngpt.ai/api/v1/tts/stream/t",
        "GET",
    )
    assert "Authorization" not in stream_headers


def test_a_rate_limited_request_waits_as_told_and_is_asked_again():
    network = Network([refusal(429, "7")])
    sleeps = []

    assert yarn(network, sleeps).record("Well done.", "idera") == MP3
    assert sleeps == [7]


def test_a_failing_line_is_given_up_after_three_attempts():
    network = Network([refusal(503), refusal(503), refusal(503)])
    sleeps = []

    with pytest.raises(Failed, match="HTTP 503"):
        yarn(network, sleeps).record("Well done.", "idera")
    assert sleeps == [2, 6]


def test_an_answer_that_is_not_an_mp3_is_asked_for_again_and_never_kept():
    network = Network(audio=b"<Error>InvalidRequest</Error>")

    with pytest.raises(Failed, match="not an MP3"):
        yarn(network).record("Well done.", "idera")


@pytest.mark.parametrize("code", [401, 402, 403])
def test_credits_spent_or_a_key_refused_stops_the_run_with_no_retry(code):
    network = Network([refusal(code)])

    with pytest.raises(Stop):
        yarn(network).record("Well done.", "idera")
    assert len(network.requests) == 1


class Store:
    def __init__(self, refuse=()):
        self.kept, self.refuse = {}, set(refuse)

    def __call__(self, bucket, key, audio):
        if any(part in key for part in self.refuse):
            import subprocess

            raise subprocess.CalledProcessError(1, "wrangler", stderr=b"no such bucket")
        self.kept[(bucket, key)] = audio


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setitem(publish.__globals__, "HOME", tmp_path)
    return tmp_path


def run(environment="staging", store=None, network=None, **options):
    options = {
        "language": "en",
        "only": ["prompt", "feedback-correct"],
        "limit": None,
        "force": False,
        "workers": 1,
        **options,
    }
    return publish(
        environment, yarn=yarn(network or Network()), store=store or Store(), **options
    )


def test_each_line_is_kept_under_its_key_in_the_environments_bucket_with_a_local_copy(
    home,
):
    store = Store()

    outcome = run(store=store)

    assert (outcome["made"], outcome["skipped"], outcome["failed"]) == (2, 0, {})
    assert {bucket for bucket, _ in store.kept} == {"graspy-audio-staging"}
    assert [key.rsplit("/", 1)[-1] for _, key in store.kept] == [
        "yarngpt.mp3",
        "yarngpt.mp3",
    ]
    assert sorted(path.name for path in (home / "staging").iterdir()) == [
        "en-feedback-correct.mp3",
        "en-prompt.mp3",
    ]


def test_production_has_its_own_bucket_and_its_own_notes(home):
    store = Store()

    run("production", store=store)

    assert {bucket for bucket, _ in store.kept} == {"graspy-audio"}
    assert (home / "production.json").exists() and not (home / "staging.json").exists()


def test_a_second_run_goes_on_from_the_first_and_force_records_again(home):
    run()
    network = Network()

    again = run(network=network)
    forced = run(network=Network(), force=True)

    assert (again["made"], again["skipped"]) == (0, 2) and network.requests == []
    assert forced["made"] == 2


def test_a_line_that_fails_does_not_stop_the_others_and_is_run_again_next_time(home):
    network = Network([refusal(500), refusal(500), refusal(500)])
    store = Store()

    outcome = run(network=network, store=store)

    assert outcome["made"] == 1 and list(outcome["failed"]) == ["prompt"]
    assert run()["made"] == 1


def test_a_line_the_store_refuses_is_reported_and_not_noted_as_kept(home):
    outcome = run(store=Store(refuse=["/prompt/"]))

    assert (
        list(outcome["failed"]) == ["prompt"]
        and "no such bucket" in outcome["failed"]["prompt"]
    )
    assert run()["made"] == 1


def test_a_stop_ends_the_run_and_keeps_note_of_what_was_made(home):
    network = Network(
        [
            MP3 and json.dumps({"stream_url": "/api/v1/tts/stream/t"}).encode(),
            MP3,
            refusal(402),
        ]
    )

    with pytest.raises(Stop):
        run(network=network)
    assert len(json.loads((home / "staging.json").read_text())) == 1


def test_every_published_line_is_recorded_under_the_key_the_worker_looks_for():
    from app.voice.speech.teacher_audio_contract import (
        audio_cache_key,
        published_utterance_ids,
        teacher_audio_routes,
        teacher_utterance,
    )

    found = lines_to_record("en", [], None)

    assert [line[0] for line in found] == published_utterance_ids()
    for utterance_id, key, text in found[:25]:
        yarngpt = teacher_audio_routes(teacher_utterance(utterance_id, "en"))[0]
        assert (
            key == audio_cache_key(utterance_id, "en", yarngpt)
            and text == yarngpt.request["text"]
        )


def test_production_needs_its_name_typed_and_a_dry_run_asks_nothing(home, capsys):
    with pytest.raises(SystemExit, match="--confirm production"):
        main(["production"])

    assert main(["staging", "--dry-run", "--limit", "5"]) == 0
    assert "5 lines, 5 to record" in capsys.readouterr().out


def test_the_key_is_read_from_the_environment_or_the_file_and_never_printed(
    tmp_path, monkeypatch, capsys
):
    read_key = SCRIPT["read_key"]
    keys = tmp_path / ".dev.vars"
    keys.write_text('OTHER=1\nYARNGPT_API_KEY="from-file"\n')
    monkeypatch.delenv("YARNGPT_API_KEY", raising=False)

    assert read_key(keys) == "from-file"
    monkeypatch.setenv("YARNGPT_API_KEY", "from-environment")
    assert read_key(keys) == "from-environment"
    monkeypatch.delenv("YARNGPT_API_KEY")
    with pytest.raises(SystemExit, match="No YARNGPT_API_KEY"):
        read_key(tmp_path / "missing")
    assert "from-" not in capsys.readouterr().out

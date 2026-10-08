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


def yarn(network, sleeps=None, route="stream"):
    return Yarn(
        "secret-key",
        route,
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


@pytest.fixture(autouse=True)
def never_the_real_store(monkeypatch):
    """The publisher swallows a failing line, so the guard is checked after."""
    reached = []

    def refuse(command, *args, **options):
        reached.append(command)
        raise OSError("a test must not reach the real command")

    monkeypatch.setattr(publish.__globals__["subprocess"], "run", refuse)
    yield
    assert reached == []


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

    assert sorted(line[0] for line in found) == sorted(published_utterance_ids())
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


TICKET = json.dumps({"stream_url": "/api/v1/tts/stream/t"}).encode()
FOUR = ["prompt", "feedback-correct", "feedback-retry", "feedback-unclear"]


def test_a_stop_asks_for_no_more_lines(home):
    network = Network([TICKET, MP3, refusal(402)])

    with pytest.raises(Stop):
        run(network=network, only=FOUR)

    assert len(network.requests) == 3
    assert len(json.loads((home / "staging.json").read_text())) == 1


def test_trouble_that_is_not_the_providers_is_that_lines_failure_and_the_others_go_on(
    home,
):
    class Odd(Store):
        def __call__(self, bucket, key, audio):
            if "/feedback-correct/" in key:
                raise KeyError("odd")
            super().__call__(bucket, key, audio)

    outcome = run(store=Odd(), only=FOUR)

    assert outcome["made"] == 3 and outcome["failed"] == {
        "feedback-correct": "KeyError: 'odd'"
    }


def test_what_was_kept_is_noted_after_each_line_so_a_killed_run_loses_none(home):
    first, second, third, _ = [line[0] for line in lines_to_record("en", FOUR, None)]

    class Killed(Store):
        def __call__(self, bucket, key, audio):
            if f"/{third}/" in key:
                raise KeyboardInterrupt
            super().__call__(bucket, key, audio)

    with pytest.raises(KeyboardInterrupt):
        run(store=Killed(), only=FOUR)

    kept = {
        note["id"] for note in json.loads((home / "staging.json").read_text()).values()
    }
    assert {first, second} <= kept and third not in kept


def test_the_notes_are_written_whole_and_a_damaged_file_is_ignored_with_a_word(
    home, capsys
):
    run()
    assert [
        path.name
        for path in home.iterdir()
        if path.suffix == ".tmp" or path.name.endswith(".json.tmp")
    ] == []

    (home / "staging.json").write_text('{"truncated": ')
    outcome = run()

    assert outcome["made"] == 2
    assert "damaged" in capsys.readouterr().err


def test_one_idempotency_key_serves_every_attempt_at_a_line_and_the_next_line_has_its_own():
    network = Network([refusal(503)])
    client = yarn(network)

    client.record("Well done.", "idera")
    client.record("Try again.", "idera")

    keys = [
        headers["Idempotency-key"]
        for url, _, headers, *_ in network.requests
        if url.endswith("/tts/prepare")
    ]
    assert keys[0] == keys[1] and keys[2] != keys[0]


JOB = json.dumps({"job_id": "j1", "status": "queued"}).encode()


def done(url="https://store.example/j1.mp3"):
    return json.dumps({"status": "completed", "audio_url": url}).encode()


def test_a_job_is_queued_polled_until_done_and_its_link_fetched_without_the_key():
    network = Network([JOB, json.dumps({"status": "processing"}).encode(), done(), MP3])
    sleeps = []

    audio = yarn(network, sleeps, "job").record("Well done.", "idera")

    assert audio == MP3 and sleeps == [1]
    (post, _, post_headers, body, _), poll1, poll2, link = network.requests
    assert post.endswith("/api/v1/tts") and json.loads(body) == {
        "text": "Well done.",
        "voice": "idera",
        "output_format": "mp3",
    }
    assert (
        post_headers["Idempotency-key"]
        and poll1[0].endswith("/api/v1/status/j1")
        and poll2[0].endswith("/api/v1/status/j1")
    )
    assert link[0] == "https://store.example/j1.mp3" and "Authorization" not in link[2]


def test_a_job_that_fails_is_that_lines_failure_with_the_providers_words():
    network = Network(
        [
            JOB,
            json.dumps(
                {
                    "status": "failed",
                    "user_message": "the synthesis backend was unavailable",
                }
            ).encode(),
        ]
        * 3
    )

    with pytest.raises(Failed, match="synthesis backend was unavailable"):
        yarn(network, route="job").record("Well done.", "idera")


def test_a_job_that_never_finishes_is_given_up_on():
    network = Network(
        ([JOB] + [json.dumps({"status": "processing"}).encode()] * 150) * 3
    )

    with pytest.raises(Failed, match="did not finish"):
        yarn(network, route="job").record("Well done.", "idera")


def test_a_spent_daily_allowance_stops_the_run_and_says_when_a_place_frees_not_sleeping_for_it():
    network = Network([refusal(429, "987")])
    sleeps = []

    with pytest.raises(Stop, match="16 minutes"):
        yarn(network, sleeps).record("Well done.", "idera")
    assert sleeps == [] and len(network.requests) == 1


def test_a_short_rate_limit_is_waited_out_and_a_long_one_is_not():
    network = Network([refusal(429, "299")])
    sleeps = []

    assert yarn(network, sleeps).record("Well done.", "idera") == MP3
    assert sleeps == [299]


def test_the_lines_the_lessons_say_are_recorded_first():
    ordered = [line[0] for line in lines_to_record("en", [], None)]
    plan_lines = SCRIPT["lessons_say"]()

    assert len(plan_lines) > 100
    assert all(
        utterance_id in plan_lines for utterance_id in ordered[: len(plan_lines)]
    )


def refusal_with(code: int, body: dict, retry_after: str | None = None):
    headers = {"Retry-After": retry_after} if retry_after else {}
    return urllib.error.HTTPError(
        "https://yarngpt.ai",
        code,
        "refused",
        SimpleNamespace(get=headers.get),
        io.BytesIO(json.dumps(body).encode()),
    )


def test_the_credits_left_and_needed_are_said_when_the_402_gives_them():
    network = Network(
        [
            refusal_with(
                402,
                {
                    "error": {
                        "code": "QUOTA_EXCEEDED",
                        "details": {"credits_remaining": 4, "credits_required": 5},
                    }
                },
            )
        ]
    )

    with pytest.raises(Stop, match=r"4 left, 5 needed"):
        yarn(network).record("Okay.", "idera")


def test_an_expired_link_is_that_attempts_failure_and_the_job_is_asked_after_again_not_a_refused_key():
    network = Network(
        [JOB, done(), refusal(403), JOB, done("https://store.example/fresh.mp3"), MP3]
    )

    assert yarn(network, route="job").record("Well done.", "idera") == MP3
    assert network.requests[-1][0] == "https://store.example/fresh.mp3"


@pytest.mark.parametrize(
    "bad",
    [
        json.dumps({"status": "completed"}).encode(),
        b"<html>502 Bad Gateway</html>",
        json.dumps({"job_id": ""}).encode(),
    ],
)
def test_an_answer_without_what_was_wanted_is_a_failed_attempt_and_is_asked_for_again(
    bad,
):
    network = Network(
        [bad, JOB, done(), MP3]
        if bad != json.dumps({"status": "completed"}).encode()
        else [JOB, bad, JOB, done(), MP3]
    )

    assert yarn(network, route="job").record("Well done.", "idera") == MP3


def test_the_stop_after_a_long_wait_names_the_route_it_is_on():
    stream = Network([refusal(429, "987")])
    job = Network([refusal(429, "987")])

    with pytest.raises(Stop, match="--route job"):
        yarn(stream).record("Well done.", "idera")
    with pytest.raises(Stop) as stopped:
        yarn(job, route="job").record("Well done.", "idera")
    assert "--route job" not in str(stopped.value)


def test_a_recording_is_kept_locally_before_the_store_is_asked_so_a_refused_store_loses_nothing_paid_for(
    home,
):
    outcome = run(store=Store(refuse=["/prompt/"]), only=["prompt"])

    assert list(outcome["failed"]) == ["prompt"]
    assert (home / "staging" / "en-prompt.mp3").read_bytes() == MP3


def test_a_stop_leaves_its_counts_to_be_said(home, capsys, monkeypatch):
    monkeypatch.setitem(main.__globals__, "read_key", lambda _: "k")
    monkeypatch.setitem(
        main.__globals__,
        "Yarn",
        lambda key, route: yarn(Network([TICKET, MP3, refusal(402)])),
    )
    monkeypatch.setitem(main.__globals__, "keep", Store())

    assert main(["staging", "--workers", "1", "--limit", "4"]) == 2
    said = capsys.readouterr().out
    assert "STOPPED" in said and "the notes are saved" in said

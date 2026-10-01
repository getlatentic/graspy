import asyncio
import json
import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.voice.speech import nova_asr
from app.voice.speech.nova_asr import heard_by_nova, nova_text
from app.voice.speech.whisper_asr import english_asr, transcribe_english


class Ai:
    """Workers AI as the Worker sees it: each model answers from its own script."""

    def __init__(self, nova=None, whisper=None):
        self.scripts = {
            nova_asr.NOVA_MODEL: list(nova or []),
            "whisper": list(whisper or []),
        }
        self.asked = []

    async def run(self, model, inputs):
        self.asked.append(model)
        script = self.scripts[model if model == nova_asr.NOVA_MODEL else "whisper"]
        reply = script.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def heard(text):
    return {"results": {"channels": [{"alternatives": [{"transcript": text}]}]}}


def intron(text="1, 2"):
    calls = []

    async def ask(audio, language, api_key, file_name, hedge=True):
        calls.append(file_name)
        return text, 900

    ask.calls = calls
    return ask


def env(ai, asr="nova"):
    return SimpleNamespace(AI=ai, ENGLISH_ASR=asr)


@pytest.fixture(autouse=True)
def no_browser_runtime(monkeypatch):
    monkeypatch.setattr(nova_asr, "nova_request", lambda audio: {"audio": audio})


def test_the_transcript_is_the_first_alternative_of_the_first_channel_and_empty_for_no_speech():
    assert nova_text(heard(" 19 20 ")) == "19 20"
    assert nova_text(heard("")) == ""
    assert nova_text({}) == ""
    assert nova_text({"results": {"channels": []}}) == ""


def test_the_deployment_can_choose_nova_and_anything_else_is_whisper():
    assert english_asr(SimpleNamespace(ENGLISH_ASR="nova")) == "nova"
    assert english_asr(SimpleNamespace(ENGLISH_ASR="Intron")) == "intron"
    assert english_asr(SimpleNamespace(ENGLISH_ASR="other")) == "whisper"
    assert english_asr(SimpleNamespace()) == "whisper"


@pytest.mark.asyncio
async def test_nova_answers_and_nothing_else_is_asked():
    ai, ask = Ai(nova=[heard("10")]), intron()
    text, ms, heard_by = await transcribe_english(env(ai), b"a", "key", "s.wav", ask)
    assert (text, heard_by) == ("10", "nova")
    assert ai.asked == [nova_asr.NOVA_MODEL] and ask.calls == []
    assert isinstance(ms, int)


@pytest.mark.asyncio
async def test_whisper_is_asked_when_nova_cannot_answer():
    ai = Ai(nova=[RuntimeError("5006")], whisper=[{"text": "ten"}])
    text, _, heard_by = await transcribe_english(
        env(ai), b"a", "key", "s.wav", intron()
    )
    assert (text, heard_by) == ("ten", "whisper")


@pytest.mark.asyncio
async def test_intron_is_asked_when_nova_hears_no_speech_and_whisper_is_not_asked_after_it():
    ai, ask = Ai(nova=[heard("")]), intron("no")
    text, _, heard_by = await transcribe_english(env(ai), b"a", "key", "s.wav", ask)
    assert (text, heard_by) == ("no", "intron_sync")
    assert ai.asked == [nova_asr.NOVA_MODEL]


@pytest.mark.asyncio
async def test_a_slow_nova_is_not_waited_for_or_asked_twice(monkeypatch):
    monkeypatch.setattr(nova_asr, "NOVA_TIMEOUT_SECONDS", 0.01)

    class Slow:
        asked = 0

        async def run(self, model, inputs):
            Slow.asked += 1
            await asyncio.sleep(1)

    assert await heard_by_nova(Slow(), b"a") is None
    assert Slow.asked == 1


@pytest.mark.asyncio
async def test_intron_is_the_second_opinion_on_what_nova_wrote_when_it_is_no_number():
    from app.voice.exercises import SpokenAnswerExercise
    from app.voice.speech.second_opinion import wants_a_second_opinion

    def wanted(text):
        return wants_a_second_opinion(
            SpokenAnswerExercise("p", "m", ("ten", "10")), text
        )

    ai, ask = Ai(nova=[heard("chainsaw")]), intron("10.")
    text, _, heard_by = await transcribe_english(
        env(ai), b"a", "key", "s.wav", ask, wanted
    )
    assert (text, heard_by) == ("10.", "intron_sync")
    ai, ask = Ai(nova=[heard("chainsaw")]), intron("Chinsa")
    text, _, heard_by = await transcribe_english(
        env(ai), b"a", "key", "s.wav", ask, wanted
    )
    assert (text, heard_by) == ("chainsaw", "nova")


def test_a_turn_can_be_filed_under_nova_and_keeps_what_the_earlier_migrations_added(
    tmp_path,
):
    db = sqlite3.connect(tmp_path / "turns.db")
    for migration in sorted((Path(__file__).parents[1] / "migrations").glob("*.sql")):
        db.executescript(migration.read_text())
    metadata = json.dumps({"plan_id": "p", "event_id": "assess"})
    db.execute(
        "INSERT INTO samples (id, owner_id, idempotency_key, metadata_fingerprint, state, metadata_json, "
        "created_at, audio_key, uploaded_at) VALUES ('s', 'o', 's', 'fp', 'ready', ?, 0, 's', 0)",
        (metadata,),
    )
    db.execute(
        "INSERT INTO tutoring_turns (sample_id, state, transcript, decision, feedback, provider, latency_ms, "
        "updated_at, verdict, heard_kind) VALUES ('s', 'complete', 'x', 'correct', 'f', 'nova', 1, 0, 'unheard', 'dont_know')"
    )
    assert db.execute(
        "SELECT provider, verdict, heard_kind FROM tutoring_turns"
    ).fetchall() == [("nova", "unheard", "dont_know")]
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("UPDATE tutoring_turns SET provider = 'deepgram'")

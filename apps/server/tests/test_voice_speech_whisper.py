"""English is heard by Whisper first, with Intron as the second opinion."""

from types import SimpleNamespace

import pytest

from app.voice.speech import whisper_asr
from app.voice.speech.whisper_asr import (
    WHISPER_MODEL,
    WHISPER_TRIES,
    english_asr,
    heard_by_whisper,
    transcribe_english,
    whisper_request,
    whisper_text,
)


class Ai:
    """Workers AI as the Worker sees it: `run(model, inputs)`, answering from a script."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.asked = []

    async def run(self, model, inputs):
        self.asked.append((model, inputs))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def intron(text="1, 2, 3"):
    calls = []

    async def ask(audio, language, api_key, file_name):
        calls.append((language, api_key, file_name))
        return text, 900

    ask.calls = calls
    return ask


def env(ai, asr=None):
    return SimpleNamespace(AI=ai, **({"ENGLISH_ASR": asr} if asr else {}))


def test_the_request_is_english_with_the_voice_activity_filter_on():
    request = whisper_request(b"\x00\x01")
    assert request == {"audio": "AAE=", "language": "en", "vad_filter": True}


def test_the_text_is_what_whisper_heard_and_empty_for_no_speech():
    assert whisper_text({"text": " 5, 10, 15. "}) == "5, 10, 15."
    assert whisper_text({"text": ""}) == ""
    assert whisper_text({}) == ""
    assert whisper_text(None) == ""


def test_english_is_heard_by_whisper_unless_the_deployment_says_intron():
    assert english_asr(SimpleNamespace()) == "whisper"
    assert english_asr(SimpleNamespace(ENGLISH_ASR="intron")) == "intron"
    assert english_asr(SimpleNamespace(ENGLISH_ASR="Whisper")) == "whisper"
    assert english_asr(SimpleNamespace(ENGLISH_ASR="something else")) == "whisper"


@pytest.mark.asyncio
async def test_a_decode_error_is_asked_again_and_the_second_answer_is_taken():
    ai = Ai(RuntimeError("3030: Failed to decode audio file"), {"text": "5, 10, 15"})
    assert await heard_by_whisper(ai, b"audio") == "5, 10, 15"
    assert [model for model, _ in ai.asked] == [WHISPER_MODEL] * 2


@pytest.mark.asyncio
async def test_no_answer_after_the_tries_is_none():
    ai = Ai(*[RuntimeError("decode")] * WHISPER_TRIES)
    assert await heard_by_whisper(ai, b"audio") is None


@pytest.mark.asyncio
async def test_a_slow_whisper_is_given_up_on(monkeypatch):
    import asyncio

    monkeypatch.setattr(whisper_asr, "WHISPER_TIMEOUT_SECONDS", 0.01)

    class Slow:
        async def run(self, model, inputs):
            await asyncio.sleep(1)

    assert await heard_by_whisper(Slow(), b"audio") is None


@pytest.mark.asyncio
async def test_whisper_answers_and_intron_is_not_asked():
    ai, ask = Ai({"text": "5, 10, 15, 20, 25"}), intron()
    text, ms, heard_by = await transcribe_english(env(ai), b"a", "key", "s.wav", ask)
    assert (text, heard_by) == ("5, 10, 15, 20, 25", "whisper")
    assert ask.calls == []
    assert isinstance(ms, int)


@pytest.mark.asyncio
async def test_intron_is_asked_when_whisper_cannot_answer():
    ai, ask = Ai(*[RuntimeError("decode")] * WHISPER_TRIES), intron("5, 10")
    text, _, heard_by = await transcribe_english(env(ai), b"a", "key", "s.wav", ask)
    assert (text, heard_by) == ("5, 10", "intron_sync")
    assert ask.calls == [("en", "key", "s.wav")]


@pytest.mark.asyncio
async def test_intron_is_the_second_opinion_when_whisper_hears_nothing():
    ai, ask = Ai({"text": ""}), intron("no")
    text, _, heard_by = await transcribe_english(env(ai), b"a", "key", "s.wav", ask)
    assert (text, heard_by) == ("no", "intron_sync")


@pytest.mark.asyncio
async def test_the_deployment_can_send_english_back_to_intron():
    ai, ask = Ai({"text": "x"}), intron("via intron")
    text, _, heard_by = await transcribe_english(
        env(ai, "intron"), b"a", "key", "s.wav", ask
    )
    assert (text, heard_by) == ("via intron", "intron_sync")
    assert ai.asked == []


@pytest.mark.asyncio
async def test_without_workers_ai_english_is_heard_by_intron():
    ask = intron("via intron")
    text, _, heard_by = await transcribe_english(
        SimpleNamespace(), b"a", "key", "s.wav", ask
    )
    assert (text, heard_by) == ("via intron", "intron_sync")


class TestWhichRecognizerHearsWhich:
    """The turn's recognizer follows the language spoken: English by Whisper, Yoruba and Pidgin by Intron."""

    async def _heard(self, monkeypatch, spoken, ai):
        from app.voice import worker_evaluation
        from app.voice.exercises import Transport

        ask = intron("via intron")
        monkeypatch.setattr(worker_evaluation, "transcribe_intron_sync", ask)
        exercise = SimpleNamespace(transport=Transport.INTRON_SYNC)
        heard = await worker_evaluation._transcribe(
            SimpleNamespace(AI=ai, INTRON_API_KEY="k"),
            exercise,
            b"audio",
            {"spoken_language": spoken, "language_pair": "yo-en"},
            "sample",
            None,
        )
        return heard, ask

    async def test_english_is_heard_by_whisper_and_recorded_as_it(self, monkeypatch):
        (text, _, language, provider), ask = await self._heard(
            monkeypatch, "en", Ai({"text": "5, 10, 15"})
        )
        assert (text, language, provider) == ("5, 10, 15", "en", "whisper")
        assert ask.calls == []

    async def test_yoruba_and_pidgin_stay_with_intron(self, monkeypatch):
        for spoken in ("yo", "pcm"):
            ai = Ai()
            (text, _, language, provider), _ = await self._heard(
                monkeypatch, spoken, ai
            )
            assert (text, language, provider) == ("via intron", spoken, "intron_sync")
            assert ai.asked == []

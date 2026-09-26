import asyncio
import io
import struct
import wave

import pytest

from app.voice.speech.intron_sync import (
    MAX_AUDIO_SECONDS,
    NoSpeechError,
    asr_language,
    first_transcript,
    sync_form_fields,
    sync_transcript,
    with_silent_tail,
)
from app.voice.speech.sahara_protocol import pcm16_from_wav


def wav_of(pcm16: bytes) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16_000)
        audio.writeframes(pcm16)
    return buffer.getvalue()


def test_every_upload_ends_in_a_second_of_digital_silence():
    speech = struct.pack("<4h", 1200, -1200, 2400, -2400)

    padded = pcm16_from_wav(with_silent_tail(wav_of(speech)))

    assert padded[: len(speech)] == speech
    assert padded[len(speech) :] == b"\x00" * 32_000


def test_a_recording_in_another_format_is_refused_rather_than_padded_wrongly():
    stereo = io.BytesIO()
    with wave.open(stereo, "wb") as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(16_000)
        audio.writeframes(b"\x00" * 64)

    with pytest.raises(ValueError, match="16 kHz mono"):
        with_silent_tail(stereo.getvalue())


def test_form_fields_select_the_recognizer_and_disable_llm_rewrites():
    fields = sync_form_fields("gvm_1.wav", "pcm")

    assert fields == {
        "audio_file_name": "gvm_1.wav",
        "use_language_asr_input": "pcm",
        "use_disable_llm_corrections": "TRUE",
    }
    assert sync_form_fields("gvm_1.wav", "en")["use_language_asr_input"] == "en"


def test_the_spoken_language_chooses_the_recognizer_before_the_dataset_pair():
    assert asr_language({"language_pair": "yo-en", "spoken_language": "en"}) == "en"
    assert asr_language({"language_pair": "pcm-en", "spoken_language": "yo"}) == "yo"
    assert asr_language({"language_pair": "yo-en"}) == "yo"
    assert asr_language({"language_pair": "pcm-en", "spoken_language": "fr"}) == "pcm"


def test_unsupported_language_is_an_explicit_failure():
    with pytest.raises(RuntimeError, match="not configured for fr"):
        sync_form_fields("gvm_1.wav", "fr")
    with pytest.raises(RuntimeError, match="not configured for en-en"):
        asr_language({"language_pair": "en-en"})


def test_a_transcript_is_accepted_even_when_intron_reports_the_file_as_queued():
    payload = {
        "data": {
            "processing_status": "FILE_QUEUED",
            "audio_transcript": " one times one is one \n",
        },
        "status": "Ok",
    }

    assert sync_transcript(200, payload) == "one times one is one"


@pytest.mark.parametrize("transcript", ["", "\n", "   "])
def test_a_blank_transcript_is_no_speech_not_success(transcript):
    payload = {
        "data": {
            "processing_status": "FILE_TRANSCRIBED",
            "audio_transcript": transcript,
        }
    }

    with pytest.raises(NoSpeechError, match="no speech"):
        sync_transcript(200, payload)


def test_processing_timeout_and_rejections_are_reported_as_failures():
    with pytest.raises(RuntimeError, match="timed out"):
        sync_transcript(503, {"data": {"file_id": "abc"}})
    with pytest.raises(RuntimeError, match="HTTP 400: max audio duration"):
        sync_transcript(400, {"message": "max audio duration"})
    with pytest.raises(RuntimeError, match="HTTP 401"):
        sync_transcript(401, "unauthorized")


@pytest.mark.parametrize("transcript", ["4", "four", "a"])
def test_short_transcripts_have_no_minimum_character_count(transcript):
    assert (
        sync_transcript(200, {"data": {"audio_transcript": transcript}}) == transcript
    )


@pytest.mark.parametrize(
    "payload", [{}, {"data": {}}, {"data": {"audio_transcript": None}}]
)
def test_malformed_provider_results_do_not_blame_the_recording(payload):
    with pytest.raises(RuntimeError, match="no transcript field") as error:
        sync_transcript(200, payload)
    assert not isinstance(error.value, NoSpeechError)


def test_the_voice_note_limit_matches_the_provider_limit():
    assert MAX_AUDIO_SECONDS == 120


def asking(*answers, seconds=()):
    """A recognizer answering each ask in turn, the nth ask taking `seconds[n]` to answer."""
    replies, waits, asks = list(answers), list(seconds), []

    async def ask():
        answer = replies.pop(0)
        asks.append(len(asks) + 1)
        await asyncio.sleep(waits.pop(0) if waits else 0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    ask.asks = asks
    return ask


def test_a_prompt_answer_is_returned_without_asking_twice():
    ask = asking("two times seven, fourteen", "never asked")

    transcript = asyncio.run(first_transcript(ask, hedge_after=0.2))

    assert transcript == "two times seven, fourteen"
    assert ask.asks == [1]


def test_a_recognizer_sitting_on_a_recording_is_asked_again_and_the_quicker_answer_wins():
    ask = asking("the ask that sat", "the second ask", seconds=(5, 0))

    assert asyncio.run(first_transcript(ask, hedge_after=0.05)) == "the second ask"
    assert ask.asks == [1, 2]


def test_a_failed_ask_waits_for_the_other_rather_than_failing_the_turn():
    ask = asking(
        RuntimeError("Intron sync ASR returned HTTP 502"), "three times three na nine"
    )

    assert (
        asyncio.run(first_transcript(ask, hedge_after=0.05))
        == "three times three na nine"
    )


def test_a_recording_with_no_speech_in_it_still_reports_no_speech():
    ask = asking(*[NoSpeechError("no speech was heard")] * 2)

    with pytest.raises(NoSpeechError, match="no speech"):
        asyncio.run(first_transcript(ask, hedge_after=0.01))

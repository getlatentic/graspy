"""Intron synchronous file transcription (Sahara ASR) for one bounded voice note."""

import asyncio
import io
import json
import time
import wave

from .sahara_protocol import pcm16_from_wav

SYNC_ENDPOINT = "https://infer.voice.intron.io/file/v1/upload/sync"
SAMPLE_RATE = 16_000
SILENT_TAIL_SECONDS = 1
SYNC_TIMEOUT_MS = 90 * 1000
HEDGE_AFTER_SECONDS = 5


class NoSpeechError(RuntimeError):
    """The recognizer returned an empty transcript for the recording."""


MAX_AUDIO_SECONDS = 120
LANGUAGE_BY_PAIR = {"yo-en": "yo", "pcm-en": "pcm"}
SPOKEN_LANGUAGES = frozenset({"en", "yo", "pcm"})


def needs_detection(metadata: dict) -> bool:
    """The client did not say which language was spoken, so the Worker must detect it."""
    return metadata.get("spoken_language") not in SPOKEN_LANGUAGES


def asr_language(metadata: dict) -> str:
    """Pick Intron's recognizer from the language the learner actually spoke.

    The Yoruba and Pidgin models collapse an English recitation into digit runs, while the English
    model transcribed the same Xiaomi recordings almost verbatim. The dataset language pair is only
    the fallback when the client did not say which language was spoken.
    """
    spoken = metadata.get("spoken_language")
    if spoken in SPOKEN_LANGUAGES:
        return spoken
    language = LANGUAGE_BY_PAIR.get(metadata.get("language_pair"))
    if language is None:
        raise RuntimeError(
            f"Intron sync ASR is not configured for {metadata.get('language_pair')}"
        )
    return language


def with_silent_tail(wav: bytes) -> bytes:
    """The recording with a second of digital silence after it.

    Sahara's sync recognizer clips a word that ends near the end of the file, and in a maths answer
    that word is the number: a learner's "two times seven, fourteen" came back "2 x 7 40", and the
    same recording with a silent second appended came back "2 x 7, 14". Room noise after the word
    was not enough; the silence has to be digital.
    """
    pcm16 = pcm16_from_wav(wav)
    padded = io.BytesIO()
    with wave.open(padded, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(SAMPLE_RATE)
        audio.writeframes(pcm16 + b"\x00\x00" * SAMPLE_RATE * SILENT_TAIL_SECONDS)
    return padded.getvalue()


def sync_form_fields(file_name: str, language: str) -> dict[str, str]:
    if language not in SPOKEN_LANGUAGES:
        raise RuntimeError(f"Intron sync ASR is not configured for {language}")
    return {
        "audio_file_name": file_name,
        "use_language_asr_input": language,
        "use_disable_llm_corrections": "TRUE",
    }


def sync_transcript(status: int, payload: dict) -> str:
    data = payload.get("data") if isinstance(payload, dict) else None
    data = data if isinstance(data, dict) else {}
    if status == 503:
        raise RuntimeError("Intron sync ASR timed out before returning a transcript")
    if status != 200:
        detail = payload.get("message") if isinstance(payload, dict) else None
        raise RuntimeError(
            f"Intron sync ASR returned HTTP {status}: {detail or 'no detail'}"
        )
    transcript = data.get("audio_transcript")
    if isinstance(transcript, str) and transcript.strip():
        return transcript.strip()
    if isinstance(transcript, str):
        raise NoSpeechError("no speech was heard in the recording")
    raise RuntimeError("Intron sync ASR returned no transcript field")


async def _payload(response) -> dict:
    try:
        payload = await response.json()
    except ValueError:
        return {}
    return payload.to_py() if hasattr(payload, "to_py") else payload


async def _first_answer(first, hedge) -> str:
    """The first of two asks to answer, preferring the one made first when both answer at once."""
    waiting = {first, hedge}
    while waiting:
        done, waiting = await asyncio.wait(waiting, return_when=asyncio.FIRST_COMPLETED)
        for answered in (
            ask for ask in (first, hedge) if ask in done and ask.exception() is None
        ):
            return answered.result()
    raise first.exception() or hedge.exception()


async def _asked_again_when_slow(ask, after: float) -> str:
    await asyncio.sleep(after)
    return await ask()


async def _settled(*asks) -> None:
    """Every ask stopped and its outcome taken, so nothing is left running behind the answer."""
    for ask in asks:
        ask.cancel()
    await asyncio.gather(*asks, return_exceptions=True)


async def first_transcript(ask, hedge_after: float = HEDGE_AFTER_SECONDS) -> str:
    """One recording's transcript, asked for twice when the first ask is slow.

    Sahara's sync recognizer answers most recordings in under two seconds and, about once in a dozen
    takes, sits on one for a minute. A child will not wait that out, so a slow ask is joined by a
    second ask for the same audio, and whichever answers first is the answer. A failed ask is not an
    answer: the other ask is still awaited, and the first ask's failure is the one reported when
    neither of them answers.
    """
    first = asyncio.ensure_future(ask())
    hedge = asyncio.ensure_future(_asked_again_when_slow(ask, hedge_after))
    try:
        return await _first_answer(first, hedge)
    finally:
        await _settled(first, hedge)


def _upload_form(audio: bytes, language: str, file_name: str):
    from js import Array, Blob, FormData, Object, Uint8Array
    from pyodide.ffi import to_js

    form = FormData.new()
    for key, value in sync_form_fields(file_name, language).items():
        form.append(key, value)
    buffer = Uint8Array.new(len(audio))
    buffer.assign(audio)
    blob_options = to_js({"type": "audio/wav"}, dict_converter=Object.fromEntries)
    form.append("audio_file_blob", Blob.new(Array.of(buffer), blob_options), file_name)
    return form


async def _ask_intron(audio: bytes, language: str, api_key: str, file_name: str) -> str:
    """One upload of one padded recording, answered with the transcript it came back with.

    Each ask reports how long it took, so a slow answer can be told from a slow provider: a hedge
    that never wins is a hedge that is only costing a second request.
    """
    from js import AbortSignal
    from workers import fetch

    started = time.perf_counter()
    response = await fetch(
        SYNC_ENDPOINT,
        method="POST",
        headers={"Authorization": f"Bearer {api_key}"},
        body=_upload_form(audio, language, file_name),
        signal=AbortSignal.timeout(SYNC_TIMEOUT_MS),
    )
    transcript = sync_transcript(response.status, await _payload(response))
    asked_for = round((time.perf_counter() - started) * 1000)
    print(json.dumps({"asr": "intron_sync", "ask_ms": asked_for}))
    return transcript


async def transcribe_intron_sync(
    audio: bytes,
    language: str,
    api_key: str,
    file_name: str = "voice-note.wav",
) -> tuple[str, int]:
    if not api_key:
        raise RuntimeError("INTRON_API_KEY is not configured")
    padded = with_silent_tail(audio)
    started = time.perf_counter()
    transcript = await first_transcript(
        lambda: _ask_intron(padded, language, api_key, file_name)
    )
    return transcript, round((time.perf_counter() - started) * 1000)

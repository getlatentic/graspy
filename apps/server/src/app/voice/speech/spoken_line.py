"""The teacher's voice for a line nobody recorded in advance.

The published catalogue is a cache that is already warm on the day a learner installs the app.
Anything the teacher needs to say beyond it is spoken once by the provider and kept, so the second
child to hear that sentence pays nothing and waits for nothing.

The provider is fast per call and unhappy in bursts: measured, a line returns in about seven tenths
of a second, but back-to-back calls are dropped mid-connection. So a miss is made once and stored
for good, and a caller that cannot wait is expected to fall back to a catalogue line.
"""

import hashlib
import json

from .teacher_audio_contract import AudioFormat, TeacherUtterance, teacher_audio_route

SAID_PREFIX = "teacher-audio/said/v1"
SPEECH_TIMEOUT_MS = 8_000
LONGEST_LINE = 300


def speakable(text: str) -> str:
    """One spelling per sentence, so the same words never occupy two cache entries."""
    line = " ".join(text.split())
    if not line:
        raise ValueError("a spoken line cannot be empty")
    if len(line) > LONGEST_LINE:
        raise ValueError(f"a spoken line cannot exceed {LONGEST_LINE} characters")
    return line


def said_key(text: str, language: str, voice: str, extension: str) -> str:
    """Where a line lives once it has been spoken: its own words are its name."""
    seed = "\x1f".join((speakable(text), language, voice)).encode()
    return f"{SAID_PREFIX}/{language}/{voice}/{hashlib.sha256(seed).hexdigest()[:32]}.{extension}"


def speech_route(text: str, language: str, audio_format: AudioFormat = "ogg"):
    """The provider call for arbitrary words, in the same shape the catalogue is published with."""
    return teacher_audio_route(
        TeacherUtterance(text=speakable(text), language=language), audio_format
    )


async def synthesise(route, api_key: str) -> bytes:
    from js import AbortSignal
    from workers import fetch

    if not api_key:
        raise RuntimeError("SPITCH_API_KEY is not configured")
    response = await fetch(
        route.endpoint,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        body=json.dumps(route.request),
        signal=AbortSignal.timeout(SPEECH_TIMEOUT_MS),
    )
    if response.status != 200:
        raise RuntimeError(f"the voice provider answered HTTP {response.status}")
    return bytes(await response.bytes())


async def speak(
    env, text: str, language: str, api_key: str, audio_format: AudioFormat = "ogg"
) -> tuple[bytes, str, str]:
    """The audio for these words, and whether it was already kept or had to be made."""
    route = speech_route(text, language, audio_format)
    key = said_key(text, language, route.request["voice"], route.extension)
    stored = await env.AUDIO.get(key)
    if stored is not None:
        # The store hands back a memoryview; the bytes themselves are what a response can carry.
        return bytes(await stored.bytes()), route.content_type, "kept"
    audio = await synthesise(route, api_key)
    await env.AUDIO.put(key, audio, httpMetadata={"contentType": route.content_type})
    return audio, route.content_type, "made"

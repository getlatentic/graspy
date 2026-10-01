"""Deepgram's Nova-3 on Workers AI, for English.

On staging recordings of a single spoken number it read the number in 68 of 80, where Whisper read 46 and
Whisper then Intron 61, in about half the time, and it wrote two counted numbers as "19 20" where Whisper
wrote "1920". The recordings are one cloned voice, so the margin is a measurement of that voice, not of
children. A recording with no speech comes back empty; a failure to answer is None, which the caller
answers with the next recognizer."""

import asyncio
import logging

logger = logging.getLogger(__name__)

NOVA_MODEL = "@cf/deepgram/nova-3"
# Nova-3 answered in about 0.5 s on staging recordings; it is not waited for longer than Whisper is.
NOVA_TIMEOUT_SECONDS = 6


def nova_request(audio: bytes):
    """The recording as a stream the model reads, which is how Workers AI takes audio for Nova-3, and the
    options that suit a child's counted answers: English, with numbers written as digits."""
    from js import Array, Blob, Object, Uint8Array
    from pyodide.ffi import to_js

    buffer = Uint8Array.new(len(audio))
    buffer.assign(audio)
    # A Python list reaches JavaScript as a proxy, which Blob refuses; the parts must be a JS Array.
    blob = Blob.new(
        Array.of(buffer),
        to_js({"type": "audio/wav"}, dict_converter=Object.fromEntries),
    )
    return to_js(
        {
            "audio": {"body": blob.stream(), "contentType": "audio/wav"},
            "language": "en",
            "numerals": True,
        },
        dict_converter=Object.fromEntries,
    )


def nova_text(reply) -> str:
    """What Nova-3 heard, empty when it heard no speech."""
    reply = reply.to_py() if hasattr(reply, "to_py") else reply
    try:
        text = reply["results"]["channels"][0]["alternatives"][0]["transcript"]
    except KeyError, IndexError, TypeError:
        return ""
    return text.strip() if isinstance(text, str) else ""


async def heard_by_nova(ai, audio: bytes) -> str | None:
    """The text Nova-3 heard, or None when it gave no answer: a failure is not the child's, and is not asked
    again, since a slow answer says Nova-3 is slow."""
    try:
        reply = await asyncio.wait_for(
            ai.run(NOVA_MODEL, nova_request(audio)), timeout=NOVA_TIMEOUT_SECONDS
        )
        return nova_text(reply)
    except Exception:
        logger.warning("Nova-3 gave no answer", exc_info=True)
        return None

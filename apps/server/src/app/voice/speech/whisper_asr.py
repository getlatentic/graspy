"""English recognition on Workers AI, with Intron as the second opinion.

The deployment's `ENGLISH_ASR` says who is asked first: Whisper, Deepgram's Nova-3, or Intron alone. Nova-3
is followed by Intron and never by Whisper. Whisper turned a child's counted answers into what was said ("5, 10, 15, 20, 25") where Intron's English
model wrote "0510, 2025", so a right answer failed and the child was sent away. Whisper is asked first for
English; when it cannot answer, or hears nothing, Intron is asked as before. The voice-activity filter is
on: without it Whisper decodes some quiet recordings to nothing and fails on others, and with it a
recording with no speech comes back as no text instead of made-up words.
"""

import asyncio
import base64
import json
import logging
import time

from .nova_asr import heard_by_nova
from .second_opinion import reads_as_a_number

logger = logging.getLogger(__name__)

WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo"
# Whisper answered in 1.4 s at the median and 6 s at the slowest in staging lessons; the turn has 20 s in all.
WHISPER_TIMEOUT_SECONDS = 6
# Workers AI answers some recordings with a decode error that a second ask does not repeat. A slow
# answer is not asked for again: it says Whisper is slow, not that the recording was bad.
WHISPER_TRIES = 2
# Intron answers in under two seconds as a rule; a second opinion that takes longer is not waited for, since
# Whisper's own reading stands without it, and it is asked once, so a rate limit is not asked twice.
SECOND_OPINION_SECONDS = 4
ENGLISH_ASRS = ("whisper", "nova", "intron")


def english_asr(env) -> str:
    """Which recognizer hears English first: 'whisper' unless the deployment says 'nova' or 'intron'."""
    chosen = str(getattr(env, "ENGLISH_ASR", "") or "whisper").lower()
    return chosen if chosen in ENGLISH_ASRS else "whisper"


def whisper_request(audio: bytes) -> dict:
    return {
        "audio": base64.b64encode(audio).decode("ascii"),
        "language": "en",
        "vad_filter": True,
    }


def whisper_text(reply) -> str:
    """What Whisper heard, empty when it heard no speech."""
    reply = reply.to_py() if hasattr(reply, "to_py") else reply
    text = reply.get("text") if isinstance(reply, dict) else None
    return text.strip() if isinstance(text, str) else ""


async def heard_by_whisper(ai, audio: bytes) -> str | None:
    """The text Whisper heard, or None when it gave no answer in its tries."""
    for attempt in range(1, WHISPER_TRIES + 1):
        try:
            reply = await asyncio.wait_for(
                ai.run(WHISPER_MODEL, whisper_request(audio)),
                timeout=WHISPER_TIMEOUT_SECONDS,
            )
            return whisper_text(reply)
        except TimeoutError:
            logger.warning("Whisper did not answer in time")
            return None
        except Exception:  # a provider failure is not the child's
            logger.warning("Whisper gave no answer (ask %s)", attempt, exc_info=True)
    return None


async def _intron_reading(
    intron, audio: bytes, api_key: str, file_name: str
) -> str | None:
    """What Intron heard when it was asked for a second opinion, or None: that ask failing is not the child's."""
    try:
        transcript, _ = await asyncio.wait_for(
            intron(audio, "en", api_key, file_name, hedge=False),
            timeout=SECOND_OPINION_SECONDS,
        )
    except Exception:
        logger.warning("Intron gave no second opinion", exc_info=True)
        return None
    return transcript if reads_as_a_number(transcript) else None


async def _heard_first(env, audio: bytes) -> tuple[str | None, str]:
    """What the deployment's first-choice recognizer heard, and its name: empty text for no speech, None for
    no answer, which is left to Intron."""
    ai = getattr(env, "AI", None)
    engine = english_asr(env)
    if ai is None or engine == "intron":
        return None, "intron_sync"
    if engine == "nova":
        return await heard_by_nova(ai, audio), "nova"
    return await heard_by_whisper(ai, audio), "whisper"


async def transcribe_english(
    env, audio: bytes, api_key: str, file_name: str, intron, second_opinion=None
) -> tuple[str, int, str]:
    """Transcript, milliseconds, and the recognizer that gave it, for a recording in English.

    `intron` is the Intron recognizer to ask when no other is asked, gave no answer, or heard nothing.
    `second_opinion` says, of what the first recognizer heard, whether Intron is asked too; Intron's reading then stands
    only if it is a number."""
    started = time.perf_counter()
    text, heard_by = await _heard_first(env, audio)
    if text and second_opinion is not None and second_opinion(text):
        better = await _intron_reading(intron, audio, api_key, file_name)
        spent = round((time.perf_counter() - started) * 1000)
        print(
            json.dumps(
                {"asr": "second_opinion", "ms": spent, "used": better is not None}
            )
        )
        if better is not None:
            return better, spent, "intron_sync"
    if text:
        spent = round((time.perf_counter() - started) * 1000)
        print(json.dumps({"asr": heard_by, "ms": spent}))
        return text, spent, heard_by
    transcript, _ = await intron(audio, "en", api_key, file_name)
    return transcript, round((time.perf_counter() - started) * 1000), "intron_sync"

"""Detect which Intron code-switched model a voice note needs, before the note is transcribed.

Whisper (Workers AI) gives a language guess with a probability; a text pass separates English
from Nigerian Pidgin, which Whisper cannot. Every decision is reproducible from the recorded
evidence, so the dashboard can show why a note was routed the way it was.
"""

import asyncio
import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)

WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo"
CLASSIFIER_MODEL = "@cf/meta/llama-3.2-3b-instruct"
# Whisper hears a note of up to two minutes in a few seconds; 20 s is ample and still keeps a turn's
# marking (detection, 90 s transcription, 6 s classifier, 30 s tutor) well inside its 3-minute lease.
WHISPER_TIMEOUT_SECONDS = 20
CLASSIFIER_TIMEOUT_SECONDS = 6
CONFIDENT_ENGLISH = 0.6
PIDGIN_MARKERS = frozenset(
    {
        "na",
        "dey",
        "wey",
        "abi",
        "sabi",
        "wetin",
        "don",
        "wan",
        "una",
        "sef",
        "oya",
        "sha",
    }
)
# Distinctive Yoruba words only; short particles (ni, de, ka, se) collide with English and Pidgin.
YORUBA_MARKERS = frozenset(
    {
        "je",
        "ilopo",
        "lopo",
        "okan",
        "meji",
        "meta",
        "merin",
        "marun",
        "mefa",
        "meje",
        "mejo",
        "mesan",
        "mewa",
        "titi",
        "ati",
        "bawo",
        "kilo",
        "lati",
        "sugbon",
        "nitori",
    }
)
CONFIDENT_YORUBA = 0.5
CLASSIFIER_PROMPT = (
    "You classify the language of a short Nigerian classroom transcript. Answer with exactly "
    "one code: en (English), yo (Yoruba or Yoruba mixed with English), pcm (Nigerian Pidgin "
    "mixed with English). Pidgin markers include na, dey, wey, make we, abi, sabi, wetin, don, "
    "go (future), am (object). Yoruba markers include jẹ́, ni, ìlọ́po, ọ̀kan, méjì, títí, dé, kí, "
    "àti. Numbers alone are English. Answer only the code."
)


UNKNOWN = "unknown"
TEACHING_LANGUAGE = "en"


@dataclass(frozen=True)
class LanguageEvidence:
    whisper_language: str | None
    whisper_probability: float
    whisper_text: str
    classifier_answer: str | None
    language: str
    classifier_error: str | None = None
    whisper_error: str | None = None

    @property
    def known(self) -> bool:
        return self.language != UNKNOWN

    @property
    def transcription_language(self) -> str:
        """Unknown speech is transcribed in the teaching language; it is never a routed guess."""
        return self.language if self.known else TEACHING_LANGUAGE

    def to_json(self) -> dict:
        return {
            "whisper_language": self.whisper_language,
            "whisper_probability": round(self.whisper_probability, 3),
            "whisper_text": self.whisper_text[:500],
            "classifier_answer": self.classifier_answer,
            "classifier_error": self.classifier_error,
            "whisper_error": self.whisper_error,
            "language": self.language,
        }


def _tokens(text: str) -> list[str]:
    import unicodedata

    stripped = "".join(
        c
        for c in unicodedata.normalize("NFD", text.lower())
        if not unicodedata.combining(c)
    )
    return re.findall(r"[a-z]+", stripped)


def marker_language(text: str) -> str | None:
    """Deterministic text rule: Pidgin or Yoruba markers decide; no markers means no opinion."""
    words = _tokens(text)
    pidgin = sum(word in PIDGIN_MARKERS for word in words)
    yoruba = sum(word in YORUBA_MARKERS for word in words)
    if yoruba >= 2 and yoruba > pidgin:
        return "yo"
    if pidgin >= 1:
        return "pcm"
    return None


def decide_language(
    whisper_language: str | None,
    whisper_probability: float,
    whisper_text: str,
    classifier_answer: str | None,
) -> str:
    """Combine the evidence in fixed order; say "unknown" rather than guess.

    1. Bare numbers are English in any voice.
    2. Explicit Pidgin or Yoruba words in the text decide.
    3. Whisper confidently hearing Yoruba is Yoruba.
    4. Whisper confidently hearing English is English, or Pidgin if the classifier says so.
    5. Everything else is unknown: silence, another language, a low-confidence guess.
    """
    if not _tokens(whisper_text) and re.search(r"\d", whisper_text):
        return "en"
    markers = marker_language(whisper_text)
    if markers:
        return markers
    if whisper_language == "yo" and whisper_probability >= CONFIDENT_YORUBA:
        return "yo"
    answer = (classifier_answer or "").strip().lower().strip(".")
    if whisper_language == "en" and whisper_probability >= CONFIDENT_ENGLISH:
        return "pcm" if answer == "pcm" else "en"
    return UNKNOWN


def _to_py(value):
    return value.to_py() if hasattr(value, "to_py") else value


async def _bounded(call, seconds: float, what: str):
    """The model's answer, or None and the error it failed with; a failure is evidence, not a crash."""
    try:
        return _to_py(await asyncio.wait_for(call, timeout=seconds)), None
    except Exception as failure:
        logger.warning("%s failed", what, exc_info=True)
        return None, f"{type(failure).__name__}: {failure}"[:200]


async def _heard(env, audio: bytes):
    import base64

    request = {"audio": base64.b64encode(audio).decode()}
    return await _bounded(
        env.AI.run(WHISPER_MODEL, request), WHISPER_TIMEOUT_SECONDS, "Whisper"
    )


async def _classified(env, language: str, probability: float, text: str):
    messages = [
        {"role": "system", "content": CLASSIFIER_PROMPT},
        {
            "role": "user",
            "content": f"First-pass detector said: {language} "
            f"{probability:.2f}.\nTranscript: {text[:600]}",
        },
    ]
    reply, error = await _bounded(
        env.AI.run(CLASSIFIER_MODEL, {"messages": messages, "max_tokens": 4}),
        CLASSIFIER_TIMEOUT_SECONDS,
        "The language classifier",
    )
    return _classifier_text(reply), error


async def detect_spoken_language(env, audio: bytes) -> LanguageEvidence:
    """What each model heard; a model that fails or runs out of time leaves its part unknown."""
    whisper, whisper_error = await _heard(env, audio)
    info = (whisper or {}).get("transcription_info") or {}
    language = info.get("language")
    probability = float(info.get("language_probability") or 0.0)
    text = str((whisper or {}).get("text") or "")
    answer, error = None, None
    if language == "en" and probability >= CONFIDENT_ENGLISH and _tokens(text):
        answer, error = await _classified(env, language, probability, text)
    return LanguageEvidence(
        language,
        probability,
        text,
        answer,
        decide_language(language, probability, text, answer),
        classifier_error=error,
        whisper_error=whisper_error,
    )


def _classifier_text(reply) -> str | None:
    if isinstance(reply, dict):
        if isinstance(reply.get("response"), str):
            return reply["response"]
        output = reply.get("output")
        if isinstance(output, list):
            parts = []
            for item in output:
                for content in (item or {}).get("content") or []:
                    if isinstance(content, dict) and isinstance(
                        content.get("text"), str
                    ):
                        parts.append(content["text"])
            if parts:
                return "".join(parts)
    return None

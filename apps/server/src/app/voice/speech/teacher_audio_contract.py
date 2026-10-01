import hashlib
import json
from dataclasses import dataclass
from typing import Literal

from ..curriculum import (
    REPAIR_PREFIX,
    load_plans,
    plan_event_for_utterance,
    repair_target,
)
from ..spoken_numbers import number_words

UTTERANCE_ID = r"[a-z0-9.-]+"


@dataclass(frozen=True)
class TeacherUtterance:
    text: str
    language: str


@dataclass(frozen=True)
class TeacherAudioRoute:
    provider: str
    endpoint: str
    request: dict[str, str]
    extension: str
    content_type: str


_TEXT = {
    "en": {
        "prompt": "What is seven times eight?",
        "feedback-correct": "Well done. Seven times eight is fifty-six.",
        "feedback-retry": "Good try. Seven groups of eight. Let us try again.",
        "feedback-unclear": "I heard you, but not the answer. Say it again.",
        "table-1-prompt": ("Say table one, from one to twelve."),
        "table-1-feedback-correct": (
            "Well done. You said the one times table from one to twelve."
        ),
        "table-1-feedback-retry": (
            "Good try. Listen to the parts we missed. Say the full one times table again."
        ),
        "table-1-question-invite": "Tap here, then ask me your question.",
    },
    "yo": {
        "prompt": "Kí ni méje ìlọ́po mẹ́jọ?",
        "feedback-correct": "Ó tọ́. Méje ìlọ́po mẹ́jọ jẹ́ mẹ́rìndínlọ́gọ́ta.",
        "feedback-retry": "Ìdáhùn náà kò tọ́. Tún méje ìlọ́po mẹ́jọ gbìyànjú.",
        "feedback-unclear": "Mo gbọ́ ọ, ṣùgbọ́n mi ò gbọ́ ìdáhùn. Sọ ọ́ tún.",
        "table-1-prompt": ("Sọ table one, láti one dé twelve."),
        "table-1-feedback-correct": (
            "Ó dára gan. O sọ table one láti one dé twelve dáadáa."
        ),
        "table-1-feedback-retry": (
            "Ìgbìyànjú dára. Gbọ́ àwọn tó kù, lẹ́yìn náà tún gbogbo table náà sọ."
        ),
        "table-1-question-invite": ("O lè ránṣẹ́ tí o bá fẹ́ bi mí ní question."),
    },
    "pcm": {
        "prompt": "Seven times eight na how much?",
        "feedback-correct": "You do well. Seven times eight na fifty-six.",
        "feedback-retry": "Good try. Seven groups of eight. Make we try again.",
        "feedback-unclear": "I hear you, but I no hear the answer. Talk am again.",
        "table-1-prompt": ("Talk table one, from one reach twelve."),
        "table-1-feedback-correct": (
            "You do well. You talk table one from one reach twelve."
        ),
        "table-1-feedback-retry": (
            "Good try. Hear where we miss. Talk the full table one again."
        ),
        "table-1-question-invite": "You fit tap here, then ask me your question.",
    },
}


TABLES = range(1, 13)
NUMBER_WORDS = {
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
    9: "nine",
    10: "ten",
    11: "eleven",
    12: "twelve",
}
# Tables 2..12 follow the reviewed table-1 wording; table-1 keeps its published text verbatim.
_TABLE_TEMPLATES = {
    "en": {
        "prompt": (
            "Now the {n} times table. Say it from {n} times one to {n} times twelve."
        ),
        "feedback-correct": (
            "Well done. You said the {n} times table from one to twelve."
        ),
        "feedback-retry": (
            "Good try. Listen to the parts we missed. Say the full {n} times table again."
        ),
    },
    "yo": {
        "prompt": (
            "Jẹ́ ká ṣe table {n}. Sọ ọ́ láti {n} times one títí dé {n} times twelve."
        ),
        "feedback-correct": "Ó dára gan. O sọ table {n} láti one dé twelve dáadáa.",
        "feedback-retry": (
            "Ìgbìyànjú rẹ dára. Gbọ́ ibi tí a ṣe àṣìṣe. Sọ gbogbo table {n} tún."
        ),
    },
    "pcm": {
        "prompt": (
            "Make we do table {n}. Talk am from {n} times one reach {n} times twelve."
        ),
        "feedback-correct": "You do well. You talk table {n} from one reach twelve.",
        "feedback-retry": (
            "Good try. Hear where we miss. Talk the full table {n} again."
        ),
    },
}


# Moves of the lesson engine: one fact taught or asked, and the fixed notes between moves.
_FACT_TEMPLATES = {
    "en": {
        "learn": "{A} times {B} is {AB}. That is {B} {groups} of {A}.",
        "ask": "What is {A} times {B}?",
    },
    "yo": {
        "learn": "{A} times {B} jẹ́ {AB}. Ìyẹn ni {B} {groups} of {A}.",
        "ask": "Kí ni {A} times {B}?",
    },
    "pcm": {
        "learn": "{A} times {B} na {AB}. Na {B} {groups} of {A}.",
        "ask": "{A} times {B} na how much?",
    },
}
_MOVE_TEXT = {
    "en": {
        "try-again": "Good try. Say it again.",
        "correct": "Well done!",
        "no-speech": "I could not hear you. Tap and say it again.",
        "retry-facts": "Now say only these ones again.",
        "finished": "That is all for today. Well done.",
        "try-tomorrow": "That is all right. We will try again tomorrow.",
    },
    "yo": {
        "try-again": "Ìgbìyànjú dára. Tún un sọ.",
        "correct": "Ó dára!",
        "no-speech": "Mi ò gbọ́ ọ. Tẹ ibi, kí o sì tún sọ.",
        "retry-facts": "Báyìí, sọ àwọn wọ̀nyí nìkan tún.",
        "finished": "Ìyẹn ni fún òní. O ṣe dáadáa.",
        "try-tomorrow": "Kò burú. A ó tún gbìyànjú lọ́la.",
    },
    "pcm": {
        "try-again": "Good try. Talk am again.",
        "correct": "You do well!",
        "no-speech": "I no hear you. Tap and talk am again.",
        "retry-facts": "Now talk only these ones again.",
        "finished": "Na so e be for today. You do well.",
        "try-tomorrow": "No wahala. We go try again tomorrow.",
    },
}
_TABLE_TEMPLATES["en"].update(
    {
        "done-today": "Well done. We will check the {n} times table again tomorrow.",
        "mastered": "You know the {n} times table now. Well done.",
    }
)
_TABLE_TEMPLATES["yo"].update(
    {
        "done-today": "O ṣe dáadáa. A ó tún wo table {n} lọ́la.",
        "mastered": "O ti mọ table {n} báyìí. Ó dára gan.",
    }
)
_TABLE_TEMPLATES["pcm"].update(
    {
        "done-today": "You do well. We go check table {n} again tomorrow.",
        "mastered": "You sabi table {n} now. Well done.",
    }
)
TABLE_KINDS = ("prompt", "feedback-correct", "feedback-retry", "done-today", "mastered")
FACT_KINDS = ("learn", "ask")


def table_utterance_id(table: int, kind: str) -> str:
    return f"table-{table}-{kind}"


def fact_utterance_id(table: int, multiplier: int, kind: str) -> str:
    return f"fact-{table}-{multiplier}-{kind}"


def _fact_text(utterance_id: str, language: str) -> str | None:
    parts = utterance_id.split("-")
    if (
        len(parts) != 4
        or parts[0] != "fact"
        or not (parts[1].isdigit() and parts[2].isdigit())
    ):
        return None
    table, multiplier, kind = int(parts[1]), int(parts[2]), parts[3]
    if (
        table not in TABLES
        or multiplier not in TABLES
        or kind not in _FACT_TEMPLATES.get(language, {})
    ):
        return None
    return _FACT_TEMPLATES[language][kind].format(
        A=NUMBER_WORDS[table],
        B=NUMBER_WORDS[multiplier],
        AB=number_words(table * multiplier),
        # "Four times three" is three groups of four (content/child-language.md): B counts them.
        groups="group" if multiplier == 1 else "groups",
    )


def _table_text(utterance_id: str, language: str) -> str | None:
    parts = utterance_id.split("-", 2)
    if len(parts) != 3 or parts[0] != "table" or not parts[1].isdigit():
        return None
    table, kind = int(parts[1]), parts[2]
    if table not in TABLES or kind not in _TABLE_TEMPLATES.get(language, {}):
        return None
    return _TABLE_TEMPLATES[language][kind].format(n=NUMBER_WORDS[table])


def _plan_text(utterance_id: str, language: str) -> str | None:
    found = plan_event_for_utterance(utterance_id, load_plans())
    return found[1].say.get(language) if found else None


_REPAIR_TEMPLATES = {
    "en": "Start from {first}. Count on to {last}.",
    "yo": "Bẹ̀rẹ̀ láti {first}. Tẹ̀ síwájú dé {last}.",
    "pcm": "Start from {first}. Count go reach {last}.",
}


def _item_words(item_id: str) -> str:
    """An item of a list as it is said: a number in words, a letter on its own, a day or month by name."""
    if item_id.isdigit():
        return number_words(int(item_id))
    return item_id.upper() if len(item_id) == 1 else item_id.capitalize()


def _repair_text(utterance_id: str, language: str) -> str | None:
    template = _REPAIR_TEMPLATES.get(language)
    if template is None or not utterance_id.startswith(REPAIR_PREFIX):
        return None
    found = repair_target(utterance_id, load_plans(language))
    if found is None:
        return None
    items = found[2]
    return template.format(
        first=_item_words(items[0].id), last=_item_words(items[-1].id)
    )


def teacher_utterance(utterance_id: str, language: str) -> TeacherUtterance:
    text = (
        _TEXT.get(language, {}).get(utterance_id)
        or _MOVE_TEXT.get(language, {}).get(utterance_id)
        or _table_text(utterance_id, language)
        or _fact_text(utterance_id, language)
        or _plan_text(utterance_id, language)
        or _repair_text(utterance_id, language)
    )
    if text is None:
        raise ValueError("unsupported teacher utterance or language")
    # A template line can open on a number word, and it is shown on screen as well as spoken.
    return TeacherUtterance(text=text[:1].upper() + text[1:], language=language)


def published_utterance_ids() -> list[str]:
    """Every fixed utterance the publisher must produce, in publication order."""
    ids = list(_TEXT["en"])
    for table in TABLES:
        for kind in TABLE_KINDS:
            candidate = table_utterance_id(table, kind)
            if candidate not in ids:
                ids.append(candidate)
    ids.extend(_MOVE_TEXT["en"])
    ids.extend(
        fact_utterance_id(t, m, k) for t in TABLES for m in TABLES for k in FACT_KINDS
    )
    ids.extend(
        event.utterance_id(plan.id)
        for plan in load_plans().values()
        for event in plan.events
    )
    return ids


# Ogg Opus by default; MP3 for a browser that cannot play Opus, such as an older Safari.
AudioFormat = Literal["ogg", "mp3"]
_FORMATS = {
    "ogg": ("ogg_opus", "ogg", "audio/ogg"),
    "mp3": ("mp3", "mp3", "audio/mpeg"),
}


def teacher_audio_route(
    utterance: TeacherUtterance, audio_format: AudioFormat = "ogg"
) -> TeacherAudioRoute:
    """Spitch, with one voice per language across the catalogue."""
    spitch_voice = {"en": "lucy", "yo": "sade", "pcm": "boma"}[utterance.language]
    spitch_format, extension, content_type = _FORMATS[audio_format]
    spitch_request = {
        "text": utterance.text,
        "voice": spitch_voice,
        "format": spitch_format,
    }
    if utterance.language != "pcm":
        spitch_request["language"] = utterance.language
    return TeacherAudioRoute(
        provider="spitch",
        endpoint="https://api.spitch.app/v1/speech",
        request=spitch_request,
        extension=extension,
        content_type=content_type,
    )


def audio_version(route: TeacherAudioRoute) -> str:
    """The recording's identity: exactly what the provider is asked to say, in which voice."""
    spoken = json.dumps(
        {"provider": route.provider, **route.request},
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(spoken.encode()).hexdigest()[:16]


def audio_etag(version: str) -> str:
    return f'"{version}"'


def is_fresh(if_none_match: str | None, version: str) -> bool:
    """Whether the phone already holds the recording of the line's current words."""
    return if_none_match == audio_etag(version)


def audio_cache_key(
    utterance_id: str,
    language: str,
    route: TeacherAudioRoute,
) -> str:
    """Stored under its words, so a rewritten line is recorded afresh, never heard with old ones."""
    teacher_utterance(utterance_id, language)
    version = audio_version(route)
    container = f"{route.provider}.{route.extension}"
    return f"teacher-audio/v3/{language}/{utterance_id}/{version}/{container}"

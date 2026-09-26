import pytest

from app.voice.speech.language_detect import decide_language, marker_language


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("One times one, one. One times two, two.", None),
        ("1 x 1 na 1. 1 x 2 na 2.", "pcm"),
        ("make we do table one, one times one na one, e don finish", "pcm"),
        ("1 1 2 4 6 8 12", None),
        ("ọ̀kan ìlọ́po méjì jẹ́ méjì, ọ̀kan ìlọ́po mẹ́ta jẹ́ mẹ́ta", "yo"),
        ("seven times eight is fifty six", None),
    ],
)
def test_marker_rule_only_speaks_when_it_sees_pidgin_or_yoruba_markers(text, expected):
    assert marker_language(text) == expected


def test_confident_english_from_whisper_lets_the_text_decide_english_or_pidgin():
    assert decide_language("en", 0.95, "One times one, one.", "en") == "en"
    assert decide_language("en", 0.69, "1 x 1 na 1.", "pcm") == "pcm"
    assert decide_language("en", 0.69, "1 x 1 na 1.", "Multiplication.") == "pcm"
    assert decide_language("en", 0.9, "1 1 2 4 6 8 12", "yo") == "en"
    assert decide_language("en", 0.95, "seven times eight is fifty six", "pcm") == "pcm"


def test_explicit_markers_outrank_the_classifier_and_whisper():
    assert decide_language("en", 0.9, "the boy dey go", "en") == "pcm"
    assert decide_language("en", 0.9, "ọ̀kan ìlọ́po méjì jẹ́ méjì", "en") == "yo"
    assert decide_language("yo", 0.4, "one times one is one", None) == "unknown"
    assert decide_language("yo", 0.8, "one times one is one", None) == "yo"
    assert decide_language("en", 0.9, "de de de", "en") == "en"


def test_weak_evidence_is_unknown_never_a_forced_route():
    assert decide_language("ru", 0.21, "Продолжение следует...", None) == "unknown"
    assert decide_language(None, 0.0, "", None) == "unknown"
    assert decide_language("ha", 0.5, "ina kwana", None) == "unknown"
    assert decide_language("en", 0.4, "one two three", None) == "unknown"
    assert decide_language("yo", 0.4, "ọ̀kan ìlọ́po méjì", None) == "yo"
    assert decide_language("fr", 0.3, "1 2 3 4", None) == "en"
    assert (
        decide_language("en", 0.4, "seven times eight dey give fifty six", None)
        == "pcm"
    )
    assert decide_language("sw", 0.3, "ọ̀kan ìlọ́po méjì jẹ́ méjì", None) == "yo"


def test_unknown_speech_is_transcribed_in_the_teaching_language_but_not_recorded():
    from app.voice.speech.language_detect import LanguageEvidence

    unknown = LanguageEvidence("ru", 0.21, "…", None, "unknown")
    assert unknown.transcription_language == "en"
    assert not unknown.known
    assert LanguageEvidence("yo", 0.4, "…", None, "yo").transcription_language == "yo"


class FakeAi:
    def __init__(self, whisper, classifier=None, fail=False):
        self.whisper, self.classifier, self.fail = whisper, classifier, fail

    async def run(self, model, request):
        if "whisper" in model:
            return self.whisper
        if self.fail:
            raise RuntimeError("model unavailable")
        return {"response": self.classifier}


class FakeEnv:
    def __init__(self, ai):
        self.AI = ai


@pytest.mark.asyncio
async def test_detection_records_the_classifier_answer_and_its_failure():
    from app.voice.speech.language_detect import detect_spoken_language

    heard = {
        "text": "1 x 1 na 1",
        "transcription_info": {"language": "en", "language_probability": 0.7},
    }
    good = await detect_spoken_language(FakeEnv(FakeAi(heard, "pcm")), b"wav")
    assert good.language == "pcm"
    assert good.classifier_answer == "pcm"
    assert good.classifier_error is None

    broken = await detect_spoken_language(FakeEnv(FakeAi(heard, fail=True)), b"wav")
    assert broken.language == "pcm"
    assert broken.classifier_answer is None
    assert broken.classifier_error.startswith("RuntimeError")

    nothing = {"text": "", "transcription_info": {}}
    silent = await detect_spoken_language(FakeEnv(FakeAi(nothing)), b"wav")
    assert silent.language == "unknown"
    assert silent.transcription_language == "en"

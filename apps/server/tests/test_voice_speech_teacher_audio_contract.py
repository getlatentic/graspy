import re
from pathlib import Path

import pytest

from app.voice.speech.teacher_audio_contract import (
    UTTERANCE_ID,
    TeacherUtterance,
    audio_cache_key,
    audio_etag,
    audio_version,
    is_fresh,
    published_utterance_ids,
    teacher_audio_route,
    teacher_audio_routes,
    teacher_utterance,
    yarngpt_route,
)

PROJECT_ROOT = Path(__file__).parents[1]


@pytest.mark.parametrize(
    ("language", "prompt"),
    [
        ("en", "What is seven times eight?"),
        ("yo", "Kí ni méje ìlọ́po mẹ́jọ?"),
        ("pcm", "Seven times eight na how much?"),
    ],
)
def test_prompt_uses_the_reviewed_teacher_copy(language, prompt):
    utterance = teacher_utterance("prompt", language)

    assert utterance.text == prompt


@pytest.mark.parametrize("language", ["en", "yo", "pcm"])
def test_table_one_prompt_asks_for_the_whole_table_in_a_child_s_words(language):
    text = teacher_utterance("table-1-prompt", language).text.lower()

    assert "one" in text
    assert "twelve" in text
    assert "voice note" not in text


@pytest.mark.parametrize(
    ("language", "voice", "provider_language"),
    [("en", "lucy", "en"), ("yo", "sade", "yo"), ("pcm", "boma", None)],
)
def test_spitch_speaks_each_language_in_its_own_voice(
    language, voice, provider_language
):
    route = teacher_audio_route(teacher_utterance("prompt", language))

    assert route.provider == "spitch"
    assert route.request["voice"] == voice
    assert route.request["format"] == "ogg_opus"
    assert route.request.get("language") == provider_language


def test_only_fixed_product_utterances_can_spend_provider_calls():
    with pytest.raises(ValueError, match="unsupported teacher utterance"):
        teacher_utterance("say-anything", "en")
    with pytest.raises(ValueError, match="unsupported teacher utterance"):
        teacher_utterance("prompt", "fr")


def test_cache_key_names_language_utterance_words_provider_and_container():
    route = teacher_audio_route(teacher_utterance("feedback-correct", "pcm"))
    assert audio_cache_key("feedback-correct", "pcm", route) == (
        f"teacher-audio/v3/pcm/feedback-correct/{audio_version(route)}/spitch.ogg"
    )


def test_an_mp3_recording_is_its_own_file_beside_the_ogg_one():
    """For a browser that cannot play Opus; the Ogg recording keeps its key."""
    utterance = teacher_utterance("feedback-correct", "pcm")
    ogg, mp3 = teacher_audio_route(utterance), teacher_audio_route(utterance, "mp3")

    assert (mp3.request["format"], mp3.content_type) == ("mp3", "audio/mpeg")
    assert (ogg.request["format"], ogg.content_type) == ("ogg_opus", "audio/ogg")
    assert audio_cache_key("feedback-correct", "pcm", mp3).endswith("/spitch.mp3")
    assert audio_version(ogg) != audio_version(mp3)


def test_new_words_for_a_line_are_a_new_recording():
    """A rewritten line must never be spoken with the recording of its old words."""
    old, new = (
        teacher_audio_route(TeacherUtterance(text=text, language="en"))
        for text in ("Well done. You said nine.", "Well done! You said nine.")
    )

    assert audio_version(old) != audio_version(new)
    key = audio_cache_key
    assert key("feedback-correct", "en", old) != key("feedback-correct", "en", new)


def test_the_same_words_are_the_same_recording():
    route = teacher_audio_route(teacher_utterance("feedback-correct", "en"))

    again = teacher_audio_route(teacher_utterance("feedback-correct", "en"))

    assert audio_version(route) == audio_version(again)


def test_a_phone_holding_the_current_recording_is_told_so_and_one_holding_an_old_one_is_not():
    route = teacher_audio_route(teacher_utterance("feedback-correct", "en"))
    version = audio_version(route)

    assert audio_etag(version) == f'"{version}"'
    assert is_fresh(audio_etag(version), version)
    assert not is_fresh('"0000000000000000"', version)
    assert not is_fresh(None, version)


@pytest.mark.parametrize(
    "utterance_id",
    ["prompt", "table-1-prompt", "table-1-feedback-correct", "table-1-feedback-retry"],
)
def test_every_published_utterance_id_matches_the_worker_route(utterance_id):
    assert re.fullmatch(UTTERANCE_ID, utterance_id)
    teacher_utterance(utterance_id, "en")


def test_serving_a_published_line_is_a_store_lookup_and_never_a_provider_call():
    """A catalogue line is already spoken. Only a line nobody recorded costs a provider call."""
    source = (PROJECT_ROOT / "src/app/voice/speech/teacher_audio.py").read_text()

    assert "yarngpt.ai" not in source
    assert "api.spitch.app" not in source
    assert "await fetch(" not in source


@pytest.mark.parametrize("language", ["en", "yo", "pcm"])
def test_tables_two_to_twelve_follow_the_table_one_wording(language):
    seven = teacher_utterance("table-7-prompt", language).text.lower()
    assert "seven times one" in seven and "seven times twelve" in seven
    assert (
        "seven" in teacher_utterance("table-7-feedback-correct", language).text.lower()
    )
    with pytest.raises(ValueError):
        teacher_utterance("table-13-prompt", language)
    with pytest.raises(ValueError):
        teacher_utterance("table-7-question-invite", language)


def test_the_publication_list_covers_every_table_and_language_route():
    ids = published_utterance_ids()

    assert ids[:8] == [
        "prompt",
        "feedback-correct",
        "feedback-retry",
        "feedback-unclear",
        "table-1-prompt",
        "table-1-feedback-correct",
        "table-1-feedback-retry",
        "table-1-question-invite",
    ]
    from app.voice.curriculum import load_plans

    plan_events = sum(len(plan.events) for plan in load_plans().values())
    assert len(ids) == len(set(ids)) == 8 + (12 * 5 - 3) + 7 + 144 * 2 + plan_events
    assert "plan.mathematics.multiplication.table-2.present" in ids
    present = teacher_utterance(
        "plan.mathematics.multiplication.table-2.present", "pcm"
    )
    assert "Two times three na six." in present.text
    assert "no-speech" in ids
    assert "check-tomorrow" in ids
    assert "fact-12-12-learn" in ids and "table-9-mastered" in ids and "correct" in ids
    assert all(re.fullmatch(UTTERANCE_ID, i) for i in ids)


def test_a_fact_with_one_group_says_group():
    learn = teacher_utterance("fact-4-1-learn", "en").text
    assert learn == "Four times one is four. That is one group of four."


def test_fact_utterances_teach_and_ask_in_every_language():
    learn = teacher_utterance("fact-2-3-learn", "en").text
    assert learn == "Two times three is six. That is three groups of two."
    single = teacher_utterance("fact-1-4-learn", "en").text
    assert single == "One times four is four. That is four groups of one."
    assert (
        teacher_utterance("fact-9-12-ask", "pcm").text
        == "Nine times twelve na how much?"
    )
    twelve = teacher_utterance("fact-12-12-learn", "yo").text
    assert twelve.startswith("Twelve times twelve jẹ́ one hundred and forty-four.")
    done = teacher_utterance("table-4-done-today", "en").text
    assert done == "Well done. We will check the four times table again tomorrow."
    with pytest.raises(ValueError):
        teacher_utterance("fact-13-1-learn", "en")


def test_a_list_asked_again_from_where_it_broke_is_said_from_the_last_item_right():
    from app.voice.curriculum import repair_utterance_id

    twenty = repair_utterance_id(
        "mathematics.number.counting-to-twenty", "practice", "17"
    )
    assert (
        teacher_utterance(twenty, "en").text
        == "Start from sixteen. Count on to twenty."
    )
    letters = repair_utterance_id(
        "english.alphabet.saying-the-alphabet", "practice", "m"
    )
    assert (
        teacher_utterance(letters, "en").text
        == "Start from the letter L. Keep going to the letter Z."
    )
    days = repair_utterance_id(
        "mathematics.time.days-of-the-week", "practice", "friday"
    )
    assert (
        teacher_utterance(days, "pcm").text
        == "Start from Thursday. Count go reach Saturday."
    )
    assert teacher_utterance(days, "yo").text.startswith("Bẹ̀rẹ̀ láti Thursday")


@pytest.mark.parametrize(
    "utterance",
    [
        "repair.mathematics.time.days-of-the-week.practice.sunday",
        "repair.mathematics.time.days-of-the-week.practice.nowhere",
        "repair.mathematics.time.days-of-the-week.span.friday",
        "repair.mathematics.time.days-of-the-week.assess.friday",
        "repair.mathematics.time.days-of-the-week.guide.monday",
        "repair.mathematics.time.days-of-the-week.attention.friday",
        "repair.no.such.plan.practice.friday",
    ],
)
def test_a_repair_prompt_that_names_nothing_asks_the_provider_nothing(utterance):
    with pytest.raises(ValueError, match="unsupported teacher utterance"):
        teacher_utterance(utterance, "en")


def test_the_answer_to_a_check_is_said_for_the_child_to_say_after_the_teacher():
    days = "echo.mathematics.time.days-of-the-week.recall"
    assert (
        teacher_utterance(days, "en").text
        == "Say it after me: Sunday, Monday, Tuesday."
    )
    assert (
        teacher_utterance(days, "pcm").text
        == "Talk am after me: Sunday, Monday, Tuesday."
    )
    fives = "echo.mathematics.number.counting-in-fives.recall"
    assert teacher_utterance(fives, "en").text == "Listen: ten. Now you say ten."
    assert teacher_utterance(fives, "yo").text == "Gbọ́: ten. Ìwọ náà sọ ten."


@pytest.mark.parametrize(
    "utterance",
    [
        "echo.mathematics.time.days-of-the-week.practice",
        "echo.mathematics.time.days-of-the-week.nowhere",
        "echo.no.such.plan.recall",
    ],
)
def test_an_echo_prompt_that_names_no_check_asks_the_provider_nothing(utterance):
    with pytest.raises(ValueError, match="unsupported teacher utterance"):
        teacher_utterance(utterance, "en")


def test_the_item_a_list_broke_at_is_asked_for_and_then_said_for_the_child_to_say_after_the_teacher():
    days = "mathematics.time.days-of-the-week"
    probe, show = f"probe.{days}.practice.friday", f"show.{days}.practice.friday"
    assert teacher_utterance(probe, "en").text == "What comes after Thursday?"
    assert (
        teacher_utterance(show, "en").text == "After Thursday comes Friday. Say Friday."
    )
    assert teacher_utterance(probe, "pcm").text == "Wetin dey come after Thursday?"
    assert (
        teacher_utterance(show, "yo").text == "Lẹ́yìn Thursday ni Friday wà. Sọ Friday."
    )
    count = "mathematics.number.counting-to-twenty"
    assert (
        teacher_utterance(f"probe.{count}.practice.17", "en").text
        == "What comes after sixteen?"
    )
    letters = "english.alphabet.saying-the-alphabet"
    assert (
        teacher_utterance(f"probe.{letters}.practice.m", "en").text
        == "What comes after the letter L?"
    )


@pytest.mark.parametrize(
    "utterance",
    [
        "probe.mathematics.time.days-of-the-week.practice.sunday",
        "show.mathematics.time.days-of-the-week.practice.sunday",
        "probe.mathematics.time.days-of-the-week.assess.friday",
        "show.mathematics.time.days-of-the-week.guide.friday",
        "probe.mathematics.time.days-of-the-week.span.friday",
        "show.mathematics.time.days-of-the-week.practice.nowhere",
        "probe.no.such.plan.practice.friday",
    ],
)
def test_a_probe_or_show_prompt_that_names_nothing_asks_the_provider_nothing(utterance):
    with pytest.raises(ValueError, match="unsupported teacher utterance"):
        teacher_utterance(utterance, "en")


def test_a_probe_for_a_number_never_calls_it_a_letter_and_names_the_step_when_counting_in_steps():
    ten = "mathematics.number.counting-to-ten"
    assert (
        teacher_utterance(f"probe.{ten}.practice.3", "en").text
        == "What comes after two?"
    )
    assert (
        teacher_utterance(f"probe.{ten}.practice.3", "pcm").text
        == "Wetin dey come after two?"
    )
    twos = "mathematics.number.counting-in-twos"
    assert (
        teacher_utterance(f"probe.{twos}.practice.4", "en").text
        == "Counting in twos, what comes after two?"
    )
    tens = "mathematics.number.counting-in-tens"
    assert (
        teacher_utterance(f"probe.{tens}.practice.20", "en").text
        == "Counting in tens, what comes after ten?"
    )
    letters = "english.alphabet.saying-the-alphabet"
    assert (
        teacher_utterance(f"probe.{letters}.practice.c", "en").text
        == "What comes after the letter B?"
    )


def test_the_primes_are_told_not_asked_for_because_they_follow_no_rule_a_child_could_use():
    primes = "mathematics.number.prime-numbers"
    with pytest.raises(ValueError, match="unsupported teacher utterance"):
        teacher_utterance(f"probe.{primes}.practice.3", "en")
    assert (
        teacher_utterance(f"show.{primes}.practice.3", "en").text
        == "After two comes three. Say three."
    )


def test_a_small_teaching_question_is_said_in_every_language_in_english_where_none_is_written():
    prompt = "remedy.mathematics.number.counting-in-fives.recall.0"
    english = "One heap has five oranges. How many oranges are in one heap?"
    assert teacher_utterance(prompt, "en").text == english
    assert teacher_utterance(prompt, "pcm").text == english
    assert teacher_utterance(prompt, "yo").text == english


@pytest.mark.parametrize(
    "utterance",
    [
        "remedy.mathematics.number.counting-in-fives.recall.3",
        "remedy.mathematics.number.counting-in-fives.practice.0",
        "remedy.mathematics.time.days-of-the-week.recall.0",
        "remedy.no.such.plan.recall.0",
    ],
)
def test_a_small_teaching_question_that_names_nothing_asks_the_provider_nothing(
    utterance,
):
    with pytest.raises(ValueError, match="unsupported teacher utterance"):
        teacher_utterance(utterance, "en")


def test_an_english_line_is_recorded_in_idera_and_spoken_in_a_turn_by_spitch():
    utterance = teacher_utterance("prompt", "en")

    recorded, spoken = teacher_audio_routes(utterance)

    assert (
        recorded.provider,
        recorded.request["voice"],
        recorded.extension,
        recorded.content_type,
    ) == (
        "yarngpt",
        "idera",
        "mp3",
        "audio/mpeg",
    )
    assert recorded.endpoint == "https://yarngpt.ai/api/v1/tts/prepare"
    assert recorded.request["text"] == utterance.text
    assert (spoken.provider, spoken.request["voice"]) == ("spitch", "lucy")


@pytest.mark.parametrize("language", ["yo", "pcm"])
def test_another_language_is_recorded_and_spoken_by_spitch_alone(language):
    routes = teacher_audio_routes(teacher_utterance("prompt", language))

    assert [route.provider for route in routes] == ["spitch"]


def test_the_two_recordings_of_a_line_have_their_own_versions_and_keys():
    utterance = teacher_utterance("prompt", "en")
    recorded, spoken = teacher_audio_routes(utterance)

    assert audio_version(recorded) != audio_version(spoken)
    assert audio_cache_key("prompt", "en", recorded) != audio_cache_key(
        "prompt", "en", spoken
    )
    assert audio_cache_key("prompt", "en", recorded).endswith("/yarngpt.mp3")


def test_a_rewritten_line_is_recorded_afresh_and_a_changed_voice_is_a_new_recording():
    first = yarngpt_route(TeacherUtterance(text="Well done.", language="en"))
    reworded = yarngpt_route(TeacherUtterance(text="Well done, child.", language="en"))

    assert audio_version(first) != audio_version(reworded)


def test_a_requested_format_changes_the_spitch_recording_only():
    ogg = teacher_audio_routes(teacher_utterance("prompt", "en"), "ogg")
    mp3 = teacher_audio_routes(teacher_utterance("prompt", "en"), "mp3")

    assert ogg[0] == mp3[0]
    assert ogg[1] != mp3[1]

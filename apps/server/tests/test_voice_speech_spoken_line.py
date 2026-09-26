import pytest

from app.voice.speech.spoken_line import LONGEST_LINE, said_key, speakable, speech_route


def test_the_same_sentence_never_takes_two_cache_entries():
    spaced = said_key("Two times four  is eight.", "en", "lucy", "ogg")
    plain = said_key("Two times four is eight.", "en", "lucy", "ogg")

    assert spaced == plain
    assert said_key("Two times four is eight.", "yo", "lucy", "ogg") != plain
    assert said_key("Two times five is ten.", "en", "lucy", "ogg") != plain


def test_a_key_says_where_it_belongs_without_revealing_the_words():
    key = said_key("Well done.", "yo", "sade", "ogg")

    assert key.startswith("teacher-audio/said/v1/yo/sade/")
    assert key.endswith(".ogg")
    assert "Well done" not in key


def test_a_voice_and_a_language_come_from_the_published_contract():
    english = speech_route("Two times four is eight.", "en")
    yoruba = speech_route("Ó dára.", "yo")
    pidgin = speech_route("You try well well.", "pcm")

    assert english.provider == "spitch"
    assert english.request["voice"] == "lucy"
    assert english.request["language"] == "en"
    assert yoruba.request["voice"] == "sade"
    assert "language" not in pidgin.request


def test_a_line_that_cannot_be_spoken_is_refused_before_it_costs_a_call():
    with pytest.raises(ValueError, match="cannot be empty"):
        speakable("   ")
    with pytest.raises(ValueError, match="cannot exceed"):
        speakable("a " * LONGEST_LINE)

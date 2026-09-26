"""Which language a lesson is written in before it is translated."""

import pytest

from app.config.languages import (
    GENERATION_LANGUAGE,
    TRANSLATED_LANGUAGES,
    generation_language_for,
    needs_translation,
)


@pytest.mark.parametrize("language", sorted(TRANSLATED_LANGUAGES))
def test_the_translated_languages_are_generated_in_english(language):
    assert needs_translation(language)
    assert generation_language_for(language) == GENERATION_LANGUAGE


@pytest.mark.parametrize("language", ["English", "French", "Arabic", "Swahili"])
def test_every_other_language_is_generated_directly(language):
    assert not needs_translation(language)
    assert generation_language_for(language) == language


@pytest.mark.parametrize("spelling", ["Yoruba", "YORUBA", "  yoruba  ", "YoRuBa"])
def test_the_match_ignores_case_and_padding(spelling):
    """The locale reaches this from a cookie and a request body, spelled
    differently by each."""
    assert needs_translation(spelling)


@pytest.mark.parametrize("spelling", ["Nigerian Pidgin", "nigerian pidgin"])
def test_nigerian_pidgin_is_generated_in_english_as_the_web_names_it(spelling):
    """The web sends a language's English name: Nigerian Pidgin for pcm."""
    assert generation_language_for(spelling) == GENERATION_LANGUAGE

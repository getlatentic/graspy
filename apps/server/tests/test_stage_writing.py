"""How the tutor and lessons write for each stage."""

import json
from pathlib import Path

from app.config.stage_writing import WRITING
from app.education.stage import Stage

# The measured rules of content/child-language.md, which the Worker cannot
# read, so its limits are held to them here.
RULES = json.loads(
    (Path(__file__).parents[3] / "content" / "child-language.json").read_text()
)
BANDS = {
    "early": Stage.EARLY_YEARS,
    "lower": Stage.LOWER_PRIMARY,
    "upper": Stage.UPPER_PRIMARY,
}


def test_every_stage_has_its_writing():
    assert set(WRITING) == set(Stage)


def test_the_sentence_limits_are_child_languages_bands():
    for band, limit in RULES["words_per_sentence"].items():
        assert WRITING[BANDS[band]].max_sentence_words == limit


def test_a_stage_with_a_limit_is_told_it():
    guidance = WRITING[Stage.LOWER_PRIMARY].guidance()

    assert guidance.startswith("Sentences of at most 10 words. ")


def test_a_primary_sentence_limit_never_shortens_the_explanation():
    """Measured: a limit alone gave a primary child fewer steps and examples."""
    for stage in (Stage.LOWER_PRIMARY, Stage.UPPER_PRIMARY):
        assert (
            "Only the sentences are short: explain fully, with an example from "
            "the learner's own country." in WRITING[stage].guidance()
        )


def test_secondary_writing_has_no_sentence_limit():
    for stage in (Stage.JUNIOR_SECONDARY, Stage.SENIOR_SECONDARY):
        assert "Sentences of at most" not in WRITING[stage].guidance()

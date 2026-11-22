"""The maths the model writes with no delimiters, or with a mangled one, as
the web's processLatex is tested with too (apps/web/src/lib/latex.test.ts), so
the two cannot drift."""

import json
from pathlib import Path

import pytest

from app.domains.lesson.markdown import repair_markdown

CORPUS = json.loads(
    (Path(__file__).resolve().parents[3] / "tests/fixtures/math-repair.json").read_text(
        encoding="utf-8"
    )
)


@pytest.mark.parametrize("case", CORPUS["cases"], ids=lambda case: case["name"])
def test_the_text_becomes_what_the_corpus_says(case):
    assert repair_markdown(case["input"]) == case["tagged"]


@pytest.mark.parametrize("case", CORPUS["cases"], ids=lambda case: case["name"])
def test_repairing_twice_changes_nothing(case):
    assert repair_markdown(case["tagged"]) == case["tagged"]

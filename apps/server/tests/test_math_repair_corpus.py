"""Maths as the model writes it, and the code that must stay as it is. The web's
processLatex is tested with the same corpus (apps/web/src/lib/latex.test.ts and
apps/server/ui/src/shared/latex.test.ts), so the three cannot drift."""

import json
import time
from pathlib import Path

import pytest

from app.domains.lesson.markdown import repair_markdown
from app.domains.lesson.maths import repair_reply

CORPUS = json.loads(
    (Path(__file__).resolve().parents[3] / "tests/fixtures/math-repair.json").read_text(
        encoding="utf-8"
    )
)
CASES = CORPUS["cases"]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_a_reply_becomes_what_the_corpus_says(case):
    assert repair_reply(case["input"]) == case["tagged"]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_a_lesson_field_becomes_what_the_corpus_says(case):
    assert repair_markdown(case["input"]) == case.get("lesson", case["tagged"])


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_repairing_twice_changes_nothing(case):
    assert repair_reply(case["tagged"]) == case["tagged"]


def test_the_corpus_has_cases_that_are_left_alone():
    assert sum(case["input"] == case["tagged"] for case in CASES) >= 10


# The work on a long reply is bounded: each of these took seconds or more
# when a scan could run to the end of the text from every opener.
PATHOLOGICAL = {
    "unclosed environments": "\\begin{pmatrix} 1 " * 8000,
    "unclosed tags": "<latex-inline>a " * 8000,
    "unclosed dollar pairs": "$$ a " * 20000,
    "unclosed brackets": "\\[ a " * 20000,
    "unclosed braces": "\\frac{a " * 12000,
    "unclosed parentheses": "(a + \\frac12 " * 8000,
    "backticks": "` a " * 30000,
    "fences": "``` a " * 20000,
    "long command runs": "\\alpha + " * 30000,
}


@pytest.mark.parametrize("name", PATHOLOGICAL)
def test_a_long_reply_is_repaired_in_bounded_time(name):
    text = PATHOLOGICAL[name]
    started = time.perf_counter()
    repair_reply(text)
    repair_markdown(text)
    assert time.perf_counter() - started < 3, name

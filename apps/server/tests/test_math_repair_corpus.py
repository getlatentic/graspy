"""Maths as the model writes it, and the text and code that must stay as it is.
The web's processLatex is tested with the same corpus
(apps/web/src/lib/latex.test.ts and apps/server/ui/src/shared/latex.test.ts),
so the three cannot drift."""

import json
import re
import time
from pathlib import Path

import pytest

from app.domains.lesson import maths_runs, maths_vocabulary
from app.domains.lesson.markdown import repair_markdown
from app.domains.lesson.maths import repair_reply, reply_text

APPS = Path(__file__).resolve().parents[2]
CORPUS = json.loads(
    (APPS.parent / "tests/fixtures/math-repair.json").read_text(encoding="utf-8")
)
CASES = CORPUS["cases"]
LESSON_CASES = [case for case in CASES if not case.get("replyOnly")]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_a_reply_becomes_what_the_corpus_says(case):
    assert repair_reply(case["input"]) == case["tagged"]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_what_clients_are_sent_is_what_the_corpus_says(case):
    assert reply_text(case["input"]) == case["web"]


@pytest.mark.parametrize("case", LESSON_CASES, ids=lambda case: case["name"])
def test_a_lesson_field_becomes_what_the_corpus_says(case):
    assert repair_markdown(case["input"]) == case.get("lesson", case["tagged"])


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_repairing_twice_changes_nothing(case):
    assert repair_reply(case["tagged"]) == case["tagged"]
    assert reply_text(case["web"]) == case["web"]
    assert reply_text(reply_text(case["input"])) == reply_text(case["input"])


def test_the_corpus_has_cases_that_are_left_alone_and_cases_that_change():
    assert sum(case["input"] == case["web"] for case in CASES) > 40
    assert sum(case["input"] != case["web"] for case in CASES) > 100
    assert len(CASES) > 180


def test_the_vocabulary_is_the_corpus_vocabulary():
    assert CORPUS["vocabulary"] == {
        "commands": maths_vocabulary.COMMANDS,
        "environments": maths_vocabulary.ENVIRONMENTS,
        "displayOnlyEnvironments": maths_vocabulary.DISPLAY_ONLY_ENVIRONMENTS,
        "names": maths_runs.NAMES,
    }


def test_every_display_only_environment_has_an_inline_form_or_is_block_maths():
    inline = set(maths_runs.RENAMED_ENVIRONMENTS) | set(
        maths_runs.UNWRAPPED_ENVIRONMENTS
    )
    assert set(maths_vocabulary.DISPLAY_ONLY_ENVIRONMENTS) - inline == {"CD"}
    for name in maths_runs.RENAMED_ENVIRONMENTS.values():
        assert name in maths_vocabulary.ENVIRONMENTS
        assert name not in maths_vocabulary.DISPLAY_ONLY_ENVIRONMENTS


# Each of these grows with the number of openers when a scan runs to the end of
# the text from every one. The cost of a repair is linear in the input, which
# is made long enough to measure.
PATHOLOGICAL = {
    "unclosed environments": "\\begin{pmatrix} 1 ",
    "unclosed tags": "<latex-inline>a ",
    "unclosed dollar pairs": "$$ a ",
    "unclosed brackets": "\\[ a ",
    "unclosed parentheses delimiters": "\\( a ",
    "single dollar signs": "$ a ",
    "unclosed braces": "\\frac{a ",
    "unclosed parentheses": "(a + \\frac12 ",
    "backticks": "` a ",
    "fences with a body": "```\na\n```\nb\n",
    "unclosed fences": "```\na\n",
    "tilde fences": "~~~\na\n~~~\nb\n",
    "indented fences in lists": "- a\n\n    ```\n    b\n    ```\n\n",
    "block quote fences": "> ```\n> a\n> ```\n\n",
    "unclosed tikz": "\\begin{tikzpicture} a ",
    "unclosed pre": "<pre> a ",
    "long command runs": "\\alpha + ",
    "long runs of formulas": "\\alpha = 1 and \\beta ",
    "indented code": "\n\n    a ",
    "list items and indents": "- a\n\n    b\n\n",
}


def _seconds(text: str) -> float:
    best = float("inf")
    for _ in range(3):
        started = time.perf_counter()
        repair_reply(text)
        repair_markdown(text)
        best = min(best, time.perf_counter() - started)
    return best


@pytest.mark.parametrize("name", PATHOLOGICAL)
def test_the_cost_of_a_repair_is_linear(name):
    unit = PATHOLOGICAL[name]
    copies = 1000
    small = _seconds(unit * copies)
    while small < 0.02 and copies < 64000:
        copies *= 2
        small = _seconds(unit * copies)
    # Eight times the input costs about eight times as much; a scan that is
    # quadratic costs sixty-four times, and load on the machine does not.
    large = _seconds(unit * copies * 8)
    assert large < max(small * 28, 0.2), (name, small, large)
    assert large < 6, (name, large)


# The views cannot import from the web app, so each file is kept twice. Only
# the comments that say where the twin is, and the corpus's relative path, may
# differ.
def _twin_code(path: Path) -> str:
    lines = path.read_text(encoding="utf-8").splitlines()
    kept = [
        line for line in lines if not re.match(r"//.*\btwins?\b", line, re.IGNORECASE)
    ]
    return re.sub(r"(\.\./)+tests/fixtures", "<root>/tests/fixtures", "\n".join(kept))


def _twins() -> list[str]:
    web = APPS / "web/src/lib"
    views = APPS / "server/ui/src/shared"
    names = {p.name for p in web.glob("latex*.ts") if "render" not in p.name}
    assert names == {p.name for p in views.glob("latex*.ts")}
    return sorted(names)


@pytest.mark.parametrize("name", _twins())
def test_the_lesson_views_hold_the_same_code_as_the_web(name):
    web = APPS / "web/src/lib" / name
    views = APPS / "server/ui/src/shared" / name
    assert _twin_code(web) == _twin_code(views)

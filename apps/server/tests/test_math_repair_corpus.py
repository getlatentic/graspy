"""Maths as the model writes it, and the text and code that must stay as it is.
The web's processLatex is tested with the same corpus
(apps/web/src/lib/latex.test.ts and apps/server/ui/src/shared/latex.test.ts),
so the three cannot drift."""

import json
import time
from pathlib import Path

import pytest

from app.domains.lesson import maths_runs
from app.domains.lesson.markdown import repair_markdown
from app.domains.lesson.maths import repair_reply, reply_text

CORPUS = json.loads(
    (Path(__file__).resolve().parents[3] / "tests/fixtures/math-repair.json").read_text(
        encoding="utf-8"
    )
)
CASES = CORPUS["cases"]
LESSON_CASES = [case for case in CASES if not case.get("replyOnly")]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_a_reply_becomes_what_the_corpus_says(case):
    assert repair_reply(case["input"]) == case["tagged"]


@pytest.mark.parametrize("case", LESSON_CASES, ids=lambda case: case["name"])
def test_a_lesson_field_becomes_what_the_corpus_says(case):
    assert repair_markdown(case["input"]) == case.get("lesson", case["tagged"])


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_repairing_twice_changes_nothing(case):
    assert repair_reply(case["tagged"]) == case["tagged"]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_what_clients_are_sent_has_no_tags_and_is_stable(case):
    sent = reply_text(case["input"])
    if "<latex-" not in case["input"]:
        assert "<latex-" not in sent
    assert reply_text(sent) == sent


def test_the_corpus_has_cases_that_are_left_alone_and_cases_that_change():
    assert sum(case["input"] == case["tagged"] for case in CASES) >= 25
    assert sum(case["input"] != case["tagged"] for case in CASES) >= 25


def test_the_vocabulary_is_the_corpus_vocabulary():
    assert CORPUS["vocabulary"] == {
        "commands": maths_runs.COMMANDS,
        "functions": maths_runs.FUNCTIONS,
        "names": maths_runs.NAMES,
        "environments": maths_runs.ENVIRONMENTS,
    }


# Each of these grows with the number of openers when a scan runs to the end of
# the text from every one. The cost of a repair is linear: quadrupling the
# input must not cost much more than four times as much.
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
    "fences": "``` a ",
    "tilde fences": "~~~ a ",
    "unclosed tikz": "\\begin{tikzpicture} a ",
    "long command runs": "\\alpha + ",
    "indented code": "\n\n    a ",
    "list items and indents": "- a\n\n    b\n\n",
}
SMALL = 4000


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
    small, large = _seconds(unit * SMALL), _seconds(unit * SMALL * 4)
    assert large < max(small * 8, 0.05), (name, small, large)
    assert large < 4, (name, large)


@pytest.mark.parametrize("name", ["latex", "latex-scan", "latex-runs"])
def test_the_lesson_views_hold_the_same_code_as_the_web(name):
    """The views cannot import from the web app, so each file is kept twice."""
    apps = Path(__file__).resolve().parents[2]

    def code(path: Path) -> str:
        lines = path.read_text(encoding="utf-8").splitlines()
        return "\n".join(line for line in lines if not line.startswith("//"))

    web = apps / "web/src/lib" / f"{name}.ts"
    views = apps / "server/ui/src/shared" / f"{name}.ts"
    assert code(web) == code(views)

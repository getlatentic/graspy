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
    assert sum(case["input"] != case["web"] for case in CASES) > 120
    assert len(CASES) > 260


def test_the_vocabulary_is_the_corpus_vocabulary():
    assert CORPUS["vocabulary"] == {
        "commands": maths_vocabulary.COMMANDS,
        "environments": maths_vocabulary.ENVIRONMENTS,
        "displayOnlyEnvironments": maths_vocabulary.DISPLAY_ONLY_ENVIRONMENTS,
        "needsArgument": maths_vocabulary.NEEDS_ARGUMENT,
        "needsTwoArguments": maths_vocabulary.NEEDS_TWO_ARGUMENTS,
        "infix": maths_vocabulary.INFIX,
        "names": maths_runs.NAMES,
        "functions": maths_runs.FUNCTIONS,
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
    "unclosed environments": lambda n: "\\begin{pmatrix} 1 " * n,
    "unclosed tags": lambda n: "<latex-inline>a " * n,
    "unclosed dollar pairs": lambda n: "$$ a " * n,
    "unclosed brackets": lambda n: "\\[ a " * n,
    "unclosed parentheses delimiters": lambda n: "\\( a " * n,
    "single dollar signs": lambda n: "$ a " * n,
    "unclosed braces": lambda n: "\\frac{a " * n,
    "unclosed parentheses": lambda n: "(a + \\frac12 " * n,
    "backticks": lambda n: "` a " * n,
    "double backticks": lambda n: "`` a " * n,
    "fences with a body": lambda n: "```\na\n```\nb\n" * n,
    "unclosed fences": lambda n: "```\na\n" * n,
    "tilde fences": lambda n: "~~~\na\n~~~\nb\n" * n,
    "indented fences in lists": lambda n: "- a\n\n    ```\n    b\n    ```\n\n" * n,
    "block quote fences": lambda n: "> ```\n> a\n> ```\n\n" * n,
    "unclosed tikz": lambda n: "\\begin{tikzpicture} a " * n,
    "unclosed pre": lambda n: "<pre> a " * n,
    "long command runs": lambda n: "\\alpha + " * n,
    "long runs of formulas": lambda n: "\\alpha = 1 and \\beta " * n,
    "indented code": lambda n: "\n\n    a " * n,
    "list items and indents": lambda n: "- a\n\n    b\n\n" * n,
    "operators after a command": lambda n: "\\alpha " + "= + - * / " * n,
    "closing brackets after a command": lambda n: "\\alpha ) " * n,
    "minus signs after a command": lambda n: "\\alpha - " * n,
    "opening brackets before a command": lambda n: "[ " * n + "\\alpha",
    "closing brackets after commands": lambda n: "\\alpha ] " * n,
    "table rows": lambda n: "| a | \\alpha |\n" * n,
    "letters": lambda n: "a b c " * n,
    "labels": lambda n: "a) b) " * n,
    "doubled backslashes": lambda n: "\\\\[ x " * n,
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
    make = PATHOLOGICAL[name]
    copies = 1000
    small = _seconds(make(copies))
    while small < 0.02 and copies < 64000:
        copies *= 2
        small = _seconds(make(copies))
    # Eight times the input costs about eight times as much; a scan that is
    # quadratic costs sixty-four times, and load on the machine does not.
    large = _seconds(make(copies * 8))
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

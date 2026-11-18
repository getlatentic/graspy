"""The grounding study scripts: what the judge reads, the model they refuse, and the statistics of the report."""

import importlib
import sys
from pathlib import Path

import pytest
from lesson_example import wire
from test_lesson_grounding import _course, _lesson

SCRIPTS = Path(__file__).parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))
judge = importlib.import_module("grounding_judge")
report = importlib.import_module("grounding_report")
common = importlib.import_module("grounding_common")

from app.settings import Settings


async def test_what_the_judge_reads_has_no_trace_of_the_grounding():
    _, events = await _lesson()
    shown = wire(events[-1]["payload"].lesson)
    grounding = shown["grounding"]
    assert grounding is not None

    read = judge.lesson_text(shown)

    for passage in _course().topic("Fractions").passages:
        assert passage.title not in read
    for text in (grounding["edition"], grounding["authority"], "Siyavula", "licence"):
        assert text not in read


@pytest.mark.parametrize(
    "model", ["us.anthropic.claude-x", "Claude-Opus", "anthropic/z"]
)
def test_a_claude_model_is_refused(monkeypatch, model):
    monkeypatch.setattr(common, "resolve_model", lambda _: model)

    with pytest.raises(SystemExit, match="Claude model"):
        common.study_lm(Settings())


def test_a_lesson_whose_judging_found_no_objectives_stops_the_run():
    with pytest.raises(ValueError, match="No official objectives"):
        judge.numbered_objectives("A topic nobody holds")


def test_the_sign_test_and_the_signed_rank_test_agree_with_the_known_values():
    assert report.sign_test(18, 2) == pytest.approx(0.000402, abs=1e-6)
    assert report.signed_rank_test([1, 2, 3, 4, 5]) == pytest.approx(0.0625)
    assert report.signed_rank_test([1, -2, 3, 4, 5, 6]) == pytest.approx(0.09375)
    assert report.signed_rank_test([0.0, 0.0]) == 1.0


def test_holm_scales_the_smallest_p_by_the_number_of_tests_and_never_lowers_a_later_one():
    assert report.holm([0.01, 0.04, 0.03]) == pytest.approx([0.03, 0.06, 0.06])


def test_a_difference_that_is_only_float_error_is_a_tie():
    topics = {
        "a": {
            "grounded": {"m": 0.1 + 0.2},
            "ungrounded": {"m": 0.3},
        }
    }

    row = report._comparison(topics, "m")

    assert (row["wins"], row["losses"], row["ties"]) == (0, 0, 1)


def test_the_kappa_of_scores_that_never_vary_is_undefined_and_of_identical_varied_scores_is_one():
    assert report.weighted_kappa([5, 5, 5], [5, 5, 5]) is None
    assert report.weighted_kappa([1, 3, 5, 5], [1, 3, 5, 5]) == pytest.approx(1.0)

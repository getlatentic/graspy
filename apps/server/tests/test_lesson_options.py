"""Answer options, written by the model one per line so their LaTeX needs no
escaping, and read back as the list the app shows."""

import pytest

from app.domains.lesson.options import as_option_lines, checked_answer, option_lines


@pytest.mark.parametrize(
    "written",
    [
        "- \\(\\frac{1}{2}\\)\n- 0.5\n- 50%",
        "* \\(\\frac{1}{2}\\)\n* 0.5\n* 50%",
        "A) \\(\\frac{1}{2}\\)\nB) 0.5\nC) 50%",
        "1. \\(\\frac{1}{2}\\)\n\n2. 0.5\n3. 50%\n",
    ],
    ids=["dash", "star", "letters", "numbers-and-blank-line"],
)
def test_options_are_read_whatever_marks_them(written):
    assert option_lines(written) == ["\\(\\frac{1}{2}\\)", "0.5", "50%"]


@pytest.mark.parametrize(
    "written",
    ["- - 0.875\n- - 0.5", "- A) 0.875\n- B) 0.5", "* • 0.875\n* • 0.5"],
    ids=["dash-dash", "dash-letter", "star-bullet"],
)
def test_an_option_marked_twice_is_shown_without_either_mark(written):
    """Measured: about one question in eight came back as "- - 0.875"."""
    assert option_lines(written) == ["0.875", "0.5"]


def test_an_option_starting_with_a_negative_number_keeps_its_sign():
    assert option_lines("- -3\n- 3") == ["-3", "3"]


def test_options_round_trip():
    options = ["\\(x^2\\)", "\\(\\ce{H2O}\\)"]

    assert option_lines(as_option_lines(options)) == options


@pytest.mark.parametrize("index", [-1, 3])
def test_an_answer_outside_the_options_is_refused(index):
    with pytest.raises(ValueError):
        checked_answer(index, ["a", "b", "c"])

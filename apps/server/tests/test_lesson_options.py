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
    [
        "- - 0.875\n- - 0.5",
        "- A) 0.875\n- B) 0.5",
        "- a. 0.875\n- b. 0.5",
        "* • 0.875\n* • 0.5",
    ],
    ids=["dash-dash", "dash-letter", "dash-lower-letter", "star-bullet"],
)
def test_options_all_marked_twice_are_shown_without_either_mark(written):
    """Measured: about one question in eight came back as "- - 0.875"."""
    assert option_lines(written) == ["0.875", "0.5"]


@pytest.mark.parametrize(
    ("written", "shown"),
    [
        ("- A. Lincoln", ["A. Lincoln"]),
        ("- D. H. Lawrence", ["D. H. Lawrence"]),
        ("- a) x = 2", ["a) x = 2"]),
        ("- b) and c) only", ["b) and c) only"]),
        ("- - 5", ["- 5"]),
        ("* - 4 °C", ["- 4 °C"]),
        (
            "- D. O. Fagunwa\n- A. B. Fafunwa\n- Wole Soyinka\n- Chinua Achebe",
            ["D. O. Fagunwa", "A. B. Fafunwa", "Wole Soyinka", "Chinua Achebe"],
        ),
        (
            "- A. Lincoln\n- B. Obama\n- D. Trump\n- C. Coolidge",
            ["A. Lincoln", "B. Obama", "D. Trump", "C. Coolidge"],
        ),
        (
            "- a) only\n- b) and c) only\n- a) and b) only\n- all of them",
            ["a) only", "b) and c) only", "a) and b) only", "all of them"],
        ),
        ("- - 5\n- 3\n- 7\n- 2", ["- 5", "3", "7", "2"]),
        ("* - 4 °C\n* 0 °C\n* 4 °C", ["- 4 °C", "0 °C", "4 °C"]),
    ],
    ids=[
        "initial",
        "two-initials",
        "letter-in-an-answer",
        "letters-in-an-answer",
        "dash-before-a-number",
        "minus-before-degrees",
        "nigerian-authors",
        "labels-out-of-order",
        "labels-not-on-every-option",
        "one-negative-among-others",
        "one-minus-among-temperatures",
    ],
)
def test_a_mark_is_stripped_only_when_every_option_carries_it_in_order(written, shown):
    assert option_lines(written) == shown


@pytest.mark.parametrize(
    ("written", "shown"),
    [
        (
            "- a) only\n- b) only\n- c) only\n- d) only",
            ["a) only", "b) only", "c) only", "d) only"],
        ),
        (
            "A. Adebayo\nB. Okonkwo\nC. Eze\nD. Bello",
            ["A. Adebayo", "B. Okonkwo", "C. Eze", "D. Bello"],
        ),
        (
            "- A. Adebayo\n- B. Okonkwo\n- C. Eze\n- D. Bello",
            ["A. Adebayo", "B. Okonkwo", "C. Eze", "D. Bello"],
        ),
        ("- -\n- - 5", ["-", "- 5"]),
    ],
    ids=["labels-are-the-answers", "initials-in-order", "bulleted-initials", "empty"],
)
def test_a_mark_that_is_part_of_the_answers_stays(written, shown):
    """Taking it away would leave options that cannot be told apart."""
    assert option_lines(written) == shown


def test_a_label_before_a_capitalised_answer_is_taken_only_with_a_bracket():
    assert option_lines("A) Adebayo\nB) Okonkwo") == ["Adebayo", "Okonkwo"]


def test_an_option_starting_with_a_negative_number_keeps_its_sign():
    assert option_lines("- -3\n- 3") == ["-3", "3"]


def test_options_round_trip():
    options = ["\\(x^2\\)", "\\(\\ce{H2O}\\)"]

    assert option_lines(as_option_lines(options)) == options


@pytest.mark.parametrize("index", [-1, 3])
def test_an_answer_outside_the_options_is_refused(index):
    with pytest.raises(ValueError):
        checked_answer(index, ["a", "b", "c"])

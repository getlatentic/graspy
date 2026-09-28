"""A check's options judged against the answer worked out from its question,
and repaired where code can repair them."""

import pytest

from app.domains.lesson.answers.repair import Check, problem, repaired
from app.domains.lesson.answers.verdict import Found, verdict

TWO_FIFTHS = r"Which decimal is equal to \(\frac{2}{5}\)?"


def _found(question, options, marked=0):
    judged = verdict(question, options, marked)
    return judged.found, judged.right


@pytest.mark.parametrize(
    ("question", "options", "marked", "right"),
    [
        (TWO_FIFTHS, ["0.2", "0.4", "2.5", "0.25"], 1, (1,)),
        (
            r"What is the percentage equivalent of the fraction \(\frac{7}{8}\)?",
            ["75%", "85%", "87.5%", "90%"],
            2,
            (2,),
        ),
        # 0.75 is 3/4 too, but not the percentage asked for.
        (
            r"What is the correct percentage equivalent of the fraction \(\frac{3}{4}\)?",
            ["75%", "0.75%", "3%", "0.75"],
            0,
            (0,),
        ),
        ("Simplify: 2/3 + 1/4", ["11/12", "3/7", "22/24", "1"], 0, (0,)),
        ("Solve for x: 3x - 5 = 10", ["x = 5", "x = 15", "x = 3", "x = 1"], 0, (0,)),
        ("What is 20 % of ₦50?", ["₦10", "₦60", "₦30", "₦70"], 0, (0,)),
        ("Convert 2.5 m to cm", ["25 cm", "250 cm", "2.5 m", "2500 cm"], 1, (1,)),
        (r"What is \(0.6 \times 3.5\)?", ["2.10", "21.0", "210", "0.21"], 0, (0,)),
        ("What is 1/3 + 1/3?", ["2/3", "0.67", "2/6", "1/9"], 0, (0,)),
        (
            "Express 1/3 as a decimal",
            [r"\(0.\overline{3}\)", "0.3", "3.3", "0.13"],
            0,
            (0,),
        ),
        # An option may name what the question counts.
        (
            "What is 20% of 50 mangoes?",
            ["5 mangoes", "10 mangoes", "15 mangoes"],
            1,
            (1,),
        ),
    ],
)
def test_a_key_that_is_the_one_right_option_is_right(question, options, marked, right):
    assert _found(question, options, marked) == (Found.RIGHT, right)


def test_the_measured_wrong_key_is_found_with_the_option_that_is_right():
    """A JSS 1 slide marked 0.2 as the decimal for 2/5."""
    assert _found(TWO_FIFTHS, ["0.2", "0.4", "2.5", "0.25"], 0) == (
        Found.WRONG_KEY,
        (1,),
    )


@pytest.mark.parametrize(
    ("question", "options", "right"),
    [
        (
            "Which fraction is equivalent to 0.6?",
            [
                r"\(\frac{3}{5}\)",
                r"\(\frac{6}{10}\)",
                r"\(\frac{2}{5}\)",
                r"\(\frac{1}{6}\)",
            ],
            (0, 1),
        ),
        (
            r"Which fraction is equivalent to \(\frac{3}{9}\)?",
            ["1/2", "2/6", "1/3", "4/12"],
            (1, 2, 3),
        ),
        ("What is 1/2 + 1/4?", ["3/4", "2/6", "0.75", "1/6"], (0, 2)),
        # Asked in grams by nothing: 1 kg answers it as well as 1000 g.
        ("What is 750 g + 250 g?", ["1000 g", "1 kg", "500 g", "100 g"], (0, 1)),
        ("Which is equal to 0.6?", ["3/5", "60%", "6%", "0.06"], (0, 1)),
    ],
)
def test_two_options_that_are_both_the_answer_are_found(question, options, right):
    assert _found(question, options) == (Found.DOUBLE_RIGHT, right)


@pytest.mark.parametrize(
    ("question", "options", "right"),
    [
        (
            "What is 0.6 as a fraction in its simplest form?",
            ["6/10", "3/5", "2/5", "1/6"],
            (1,),
        ),
        ("Write 3/5 as a decimal", ["0.6", "6/10", "0.35", "5.3"], (0,)),
        ("Convert 2.5 m to cm", ["250 cm", "2500 mm", "25 cm", "2.5 cm"], (0,)),
        ("Write 7/4 as a mixed number", ["1 3/4", "7/4", "1 4/7", "3/4"], (0,)),
        ("Change 2 1/2 to an improper fraction", ["5/2", "2 1/2", "3/2", "5/4"], (0,)),
    ],
)
def test_a_form_the_question_asks_for_tells_equal_options_apart(
    question, options, right
):
    assert _found(question, options, right[0]) == (Found.RIGHT, right)


@pytest.mark.parametrize(
    ("question", "options"),
    [
        ("Write 2/5 as a decimal", ["0.2", "0.5", "2.5", "0.25"]),
        # The answer is there, but not in the form asked for.
        (
            "What is 0.6 as a fraction in its simplest form?",
            ["6/10", "2/5", "1/6", "5/6"],
        ),
        ("Solve 2x + 3 = 11", ["3", "5", "7", "14"]),
    ],
)
def test_options_without_the_answer_have_no_right_option(question, options):
    assert _found(question, options) == (Found.NO_RIGHT_OPTION, ())


@pytest.mark.parametrize(
    ("question", "options"),
    [
        # Rounded options for an answer that never ends.
        ("What is 1/3 as a decimal?", ["0.33", "0.3", "3.3", "0.13"]),
        ("What is 2/3 as a percentage?", ["66.7%", "66%", "60%", "70%"]),
        # A form asked for that no option is written in: misread.
        ("Write 2/5 as a percentage", ["0.4", "0.2", "2.5", "0.25"]),
        # An option that is not a number may be the answer.
        ("Write 2/5 as a decimal", ["0.2", "0.5", "2.5", "None of these"]),
        ("Which is bigger, 1/2 or 1/3?", ["1/2", "1/3"]),
        # A noun the question does not count is not read away.
        ("What is 20% of 50 mangoes?", ["5 oranges", "10 oranges", "15 oranges"]),
        (
            "If you have 200 oranges and sell 15 % of them, how many oranges are sold?",
            ["30", "20", "15", "25"],
        ),
    ],
)
def test_a_check_the_checks_cannot_be_sure_of_is_not_judged(question, options):
    assert _found(question, options) == (Found.NOT_COMPUTABLE, ())


def _check(question, options, marked=0, right="", wrong=""):
    return Check(question, options, marked, right, wrong)


def _repaired(check):
    return repaired(check, verdict(check.question, check.options, check.answer_index))


def test_a_wrong_key_is_moved_and_feedback_that_explains_the_wrong_answer_is_mended():
    check = _check(
        TWO_FIFTHS,
        ["0.2", "0.4", "2.5", "0.25"],
        right=r"Correct! \(\frac{2}{5}\) = 0.2.",
        wrong="Remember that 2/5 means 2 ÷ 5.",
    )

    assert _repaired(check) == _check(
        TWO_FIFTHS,
        ["0.2", "0.4", "2.5", "0.25"],
        marked=1,
        right="That's right: the answer is 0.4.",
        wrong="Remember that 2/5 means 2 ÷ 5.",
    )


def test_feedback_that_names_only_the_right_answer_is_kept_when_the_key_slipped():
    check = _check(
        TWO_FIFTHS,
        ["0.2", "0.4", "2.5", "0.25"],
        right="Correct! 2 ÷ 5 = 0.4.",
        wrong="Divide the top by the bottom.",
    )

    fixed = _repaired(check)

    assert fixed.answer_index == 1
    assert fixed.correct_feedback == "Correct! 2 ÷ 5 = 0.4."
    assert fixed.incorrect_feedback == "Divide the top by the bottom."


def test_feedback_naming_the_wrong_key_beside_the_right_answer_is_mended():
    """Measured: "Dividing 250 cm by 100 gives 2.5 m, so the correct answer
    is 0.25 m" came with 0.25 m marked."""
    check = _check(
        "What is 250 centimetres equal to in metres?",
        ["0.25 m", "2.5 m", "25 m", "0.025 m"],
        right="Well done! 250 cm ÷ 100 gives 2.5 m, so the correct answer is 0.25 m.",
        wrong="Divide by 100: 250 ÷ 100 = 2.5 m, which is 0.25 m written correctly.",
    )

    fixed = _repaired(check)

    assert fixed.answer_index == 1
    assert fixed.correct_feedback == "That's right: the answer is 2.5 m."
    assert fixed.incorrect_feedback == "Not quite: the answer is 2.5 m."


def test_the_extra_right_option_is_taken_out_and_the_key_kept():
    check = _check(
        "Which fraction is equivalent to 0.6?",
        ["3/5", "6/10", "2/5", "1/6"],
        right="Yes: 0.6 = 6/10 = 3/5.",
    )

    assert _repaired(check) == _check(
        "Which fraction is equivalent to 0.6?",
        ["3/5", "2/5", "1/6"],
        right="Yes: 0.6 = 6/10 = 3/5.",
    )


def test_when_the_key_is_wrong_and_two_options_are_right_the_first_is_kept():
    check = _check("What is 1/2 + 1/4?", ["2/6", "3/4", "1/6", "0.75"], right="2/6!")

    fixed = _repaired(check)

    assert (fixed.options, fixed.answer_index) == (["2/6", "3/4", "1/6"], 1)
    assert fixed.correct_feedback == "That's right: the answer is 3/4."


def test_taking_out_right_options_never_leaves_fewer_than_three():
    check = _check(
        r"Which fraction is equivalent to \(\frac{3}{9}\)?",
        ["1/2", "2/6", "1/3", "4/12"],
        2,
    )

    assert _repaired(check) is None
    judged = verdict(check.question, check.options, 2)
    assert repaired(check, judged, fewest=2).options == ["1/2", "1/3"]


def test_a_check_with_no_right_option_is_not_repaired_in_code():
    assert _repaired(_check("Write 2/5 as a decimal", ["0.2", "0.5", "2.5"])) is None


def test_a_check_that_is_right_or_not_worked_out_is_left_as_it_is():
    right = _check(TWO_FIFTHS, ["0.2", "0.4", "2.5"], 1, "r", "w")
    unread = _check("Ada has 5 mangoes and eats 2. How many are left?", ["3", "2"], 1)

    assert _repaired(right) is right
    assert _repaired(unread) is unread


def test_the_model_is_told_the_question_its_answer_and_the_form_asked_for():
    check = _check("Write 2/5 as a decimal", ["0.2", "0.5", "2.5", "0.25"])

    assert problem(check, verdict(check.question, check.options, 0)) == (
        "The check 'Write 2/5 as a decimal' has the answer 2/5 (0.4), written as "
        "a decimal, but none of its options ('0.2', '0.5', '2.5', '0.25') is. "
        "Write the check again with the right answer among the options, and "
        "answer_index marking it."
    )


def test_the_model_is_told_which_options_are_all_right():
    check = _check(
        r"Which fraction is equivalent to \(\frac{3}{9}\)?",
        ["1/2", "2/6", "1/3", "4/12"],
    )

    assert problem(check, verdict(check.question, check.options, 0)) == (
        "The check 'Which fraction is equivalent to \\\\(\\\\frac{3}{9}\\\\)?' has "
        "more than one right option: '2/6', '1/3', '4/12' are each 1/3, written "
        "as a fraction. Write the check again with exactly one right option, and "
        "answer_index marking it."
    )


def test_a_unit_is_part_of_the_answer_the_model_is_told():
    check = _check("Convert 2.5 m to cm", ["25 cm", "2.5 cm", "2500 cm"])

    assert "has the answer 250 cm, written in cm, but none" in problem(
        check, verdict(check.question, check.options, 0)
    )

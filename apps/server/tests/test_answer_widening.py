"""What the answer gate works out beyond arithmetic, and the checks that
contradict themselves. The cases are the wrong marked answers of the
grounding study (docs/GROUNDING_STUDY.md) that code can work out."""

import pytest

from app.domains.lesson.answers.contradiction import contradiction
from app.domains.lesson.answers.repair import Check, problem
from app.domains.lesson.answers.verdict import Found, verdict


def _found(question, options, marked):
    judged = verdict(question, options, marked)
    return judged.found, judged.right


@pytest.mark.parametrize(
    ("question", "options", "marked", "found"),
    [
        # Rounding 184 to the nearest ten, marked 190.
        (
            "A bottle of water costs ₦184. What is the price rounded to the nearest ten naira?",
            ["₦180", "₦190", "₦200", "₦170"],
            1,
            (Found.WRONG_KEY, (0,)),
        ),
        (
            "Round 3.14159 to 2 decimal places.",
            ["3.14", "3.15", "3.1", "3.2"],
            0,
            (Found.RIGHT, (0,)),
        ),
        (
            "Round 2.5 to the nearest whole number.",
            ["2", "3", "2.5", "4"],
            0,
            (Found.WRONG_KEY, (1,)),
        ),
        (
            "Round 4872 to 2 significant figures.",
            ["4800", "4900", "4870", "5000"],
            0,
            (Found.WRONG_KEY, (1,)),
        ),
        # Each price rounded, then added.
        (
            "What is the estimated total, rounding each price to the nearest 10 naira, for 42 naira, 59 naira and 77 naira?",
            ["150 naira", "170 naira", "180 naira", "190 naira"],
            1,
            (Found.WRONG_KEY, (2,)),
        ),
        # 2/7 - 1/3 is -1/21: none of the options is right.
        (
            r"What is the correct result of \(\frac{2}{7} - \frac{1}{3}\)?",
            [
                r"\(\frac{1}{21}\)",
                r"\(\frac{5}{21}\)",
                r"\(\frac{1}{7}\)",
                r"\(\frac{5}{14}\)",
            ],
            1,
            (Found.NO_RIGHT_OPTION, ()),
        ),
        # 9/4 divided by 3/8 is 6, marked 4.
        (
            r"What is \(\frac{9}{4} \div \frac{3}{8}\)?",
            ["4", "6", "3/2", "2/3"],
            0,
            (Found.WRONG_KEY, (1,)),
        ),
        (
            "What is the Least Common Multiple of 8, 12 and 15?",
            ["60", "90", "120", "180"],
            2,
            (Found.RIGHT, (2,)),
        ),
        (
            "What is the LCM of 4 and 6?",
            ["12", "8", "24", "4"],
            3,
            (Found.WRONG_KEY, (0,)),
        ),
        (
            "What is the HCF of 36 and 48?",
            ["6", "12", "24", "4"],
            0,
            (Found.WRONG_KEY, (1,)),
        ),
        (
            "What is the LCD of the fractions 7/12 and 5/8 before you add them?",
            ["20", "24", "96", "56"],
            0,
            (Found.WRONG_KEY, (1,)),
        ),
        (
            "What is the median of the data set 5, 11, 9, 9, 10, 8, 9, 10, 6?",
            ["5", "8", "9", "10"],
            3,
            (Found.WRONG_KEY, (2,)),
        ),
        (
            "Find the median of 3, 7, 9, 12.",
            ["7", "8", "9", "10"],
            0,
            (Found.WRONG_KEY, (1,)),
        ),
        (
            "What is the mean of 4, 8 and 6?",
            ["5", "6", "7", "8"],
            1,
            (Found.RIGHT, (1,)),
        ),
        (
            "What is the range of 12, 3, 9, 20?",
            ["8", "17", "20", "3"],
            0,
            (Found.WRONG_KEY, (1,)),
        ),
        (
            "What is the mode of 4, 7, 4, 9, 4?",
            ["4", "7", "9", "5"],
            1,
            (Found.WRONG_KEY, (0,)),
        ),
    ],
)
def test_the_answer_is_worked_out(question, options, marked, found):
    assert _found(question, options, marked) == found


@pytest.mark.parametrize(
    ("question", "options"),
    [
        # Not asked as a number to round: it works backwards.
        (
            "Which number rounds to 200 to the nearest hundred?",
            ["149", "151", "250", "199"],
        ),
        # Rounded before or after adding gives different answers.
        (
            "What is the estimated total, to the nearest ten, of 44 naira and 41 naira?",
            ["80", "90", "100", "70"],
        ),
        # Quantities and prices to multiply, not amounts to add.
        (
            "A student buys 3 notebooks at ₦1250 each and 2 pens at ₦780 each. What is the total, rounded to the nearest hundred naira?",
            ["₦5300", "₦5400", "₦5500", "₦5200"],
        ),
        (
            "Round each price to the nearest ten before adding: 3 kg of tomatoes at ₦128 per kg and 2 kg of onions at ₦57 per kg. What is the total?",
            ["₦770", "₦800", "₦830", "₦860"],
        ),
        # Halves of a negative number round two ways.
        ("Round -2.5 to the nearest whole number.", ["-2", "-3", "-2.5", "2"]),
        # Several numbers, none to add.
        ("Round 3.46 and 8.21 to one decimal place.", ["3.5", "8.2", "3.4", "8.3"]),
        # A list with no single mode, and a list with a thousands separator.
        ("What is the mode of 1, 2, 3?", ["1", "2", "3", "4"]),
        ("What is the mode of 1,200, 5 and 5?", ["5", "1", "200", "2"]),
        # Fractions have no LCM here, and the numbers must be the whole question.
        ("What is the LCM of 1/2 and 1/3?", ["6", "1/6", "5", "1"]),
        ("What is the LCM of 4 and 6 for the buses?", ["12", "8", "24", "4"]),
        # More after the list means the list is not the data.
        ("What is the median of the 5 students: 12, 14, 9?", ["12", "9", "14", "5"]),
    ],
)
def test_a_question_that_is_not_plainly_one_to_work_out_is_left_alone(
    question, options
):
    assert verdict(question, options, 0).found is Found.NOT_COMPUTABLE


def test_options_that_are_decimals_rounded_from_an_answer_that_never_ends_are_left_alone():
    assert (
        verdict("What is 1/3 + 1/3 + 1/3 + 1/9?", ["1.11", "1.1", "1.12", "1"], 0).found
        is Found.NOT_COMPUTABLE
    )


def _check(
    question="Which?", options=("12", "8", "10"), marked=0, right="Yes.", wrong="No."
):
    return Check(question, list(options), marked, right, wrong)


@pytest.mark.parametrize(
    "feedback",
    [
        "Well done! Oops, the correct answer is actually 8.",
        "Well done! Wait – it is 8.",
        "Right. Sorry, I made a typo in the options.",
        "Correct! Actually, the correct calculation gives 8.",
        "Yes. (The correct answer index should be 1.)",
    ],
)
def test_feedback_that_corrects_itself_is_refused(feedback):
    assert "corrects itself" in contradiction(_check(right=feedback))


def test_feedback_that_points_at_another_option_by_position_is_refused():
    assert "points at an option" in contradiction(
        _check(right="Yes, option 2 is correct.")
    )
    assert "points at an option" in contradiction(
        _check(right="It is the second option.")
    )
    assert contradiction(_check(right="Yes, option 1 is correct.")) is None


def test_feedback_that_gives_a_number_that_is_another_option_is_refused():
    refused = contradiction(_check(right="1 200 × 5 kg = 6 000 kg, which is 8."))
    assert "8" in refused and "not the option marked right" in refused


@pytest.mark.parametrize(
    "right",
    [
        "Well done! 12 is the answer; it is not 8 or 10.",
        "Right: moving left five steps lands you at –2.",
        "Actually, 12 is right because it is a multiple of both.",
    ],
)
def test_feedback_that_agrees_with_its_key_is_kept(right):
    options = ("-2", "2", "10") if "–2" in right else ("12", "8", "10")
    assert contradiction(_check(options=options, right=right)) is None


def test_a_marked_option_that_is_not_a_number_is_not_looked_for_in_the_feedback():
    assert (
        contradiction(
            _check(options=("13x", "5x", "9"), right="Adding 4 and 9 gives 13x, not 9.")
        )
        is None
    )


def test_an_outlier_is_found_by_the_quartiles_and_a_claim_against_it_is_refused():
    question = "Which measure suits the data (20, 22, 19, 35, 21, 20, 18) and why?"
    options = [
        "Mean, because there is no extreme outlier.",
        "Median, because the data contain an outlier that would distort the mean.",
    ]
    refused = contradiction(_check(question, options, 0))
    assert "outlier (35)" in refused and "says it has none" in refused
    assert contradiction(_check(question, options, 1)) is None


def test_an_outlier_claim_is_left_alone_when_the_two_quartile_methods_disagree():
    question = "Is there an outlier in (1, 2, 3, 4, 5, 6, 7, 9, 12)?"
    options = ["No outlier.", "There is an outlier."]
    assert contradiction(_check(question, options, 0)) is None


def test_the_median_of_a_frequency_table_of_names_is_refused():
    table = "| Fruit | Number of students |\n|---|---|\n| Mango | 9 |\n| Banana | 6 |\n| Orange | 8 |"
    question = f"Using this table, which pair gives the mode and the median?\n{table}"
    assert "names" in contradiction(
        _check(question, ["Mango, Orange", "Mango, Mango"], 1)
    )
    numbers = "| Siblings | Frequency |\n|---|---|\n| 0 | 9 |\n| 1 | 6 |\n| 2 | 8 |"
    assert (
        contradiction(_check(f"What is the median?\n{numbers}", ["0, 1", "1"], 1))
        is None
    )


def test_a_contradicting_check_is_told_why_to_the_model_writing_it_again():
    judged = verdict("Which?", ["12", "8"], 0)
    told = problem(
        _check(),
        type(judged)(
            Found.CONTRADICTED, None, (), "the feedback corrects itself ('oops')"
        ),
    )
    assert "contradicts itself: the feedback corrects itself ('oops')" in told
    assert "no correction or second thought" in told


def test_a_friendly_oops_in_the_note_for_a_wrong_answer_is_kept():
    assert (
        contradiction(_check(wrong="Oops! Not quite. Sorry, try the tens first."))
        is None
    )
    assert "corrects itself" in contradiction(
        _check(wrong="Not quite. I made a typo above.")
    )


def test_feedback_that_quotes_what_it_works_from_is_not_taken_for_the_answer():
    check = _check(
        options=("6", "3", "2", "5"), right="Multiplying 3 by 2 gives the area."
    )
    assert contradiction(check) is None
    assert (
        contradiction(
            _check(options=("6", "3", "2", "5"), right="Multiplying 3 by 2 gives 5.")
        )
        is not None
    )


def test_a_word_after_option_is_not_an_option_letter():
    check = _check(
        marked=1, right="Yes. This is the option a careful pupil would pick."
    )
    assert contradiction(check) is None


def test_no_outlier_is_refused_only_when_a_value_is_far_from_the_rest():
    options = [
        "Mean, because there is no extreme outlier.",
        "Median, because of an outlier.",
    ]
    mild = "Which measure suits the data (10, 12, 13, 14, 15, 16, 24)?"
    assert contradiction(_check(mild, options, 0)) is None
    assert (
        contradiction(_check("Which suits (10, 12, 13, 14, 15, 16, 90)?", options, 0))
        is not None
    )
    resistant = ["Median, because the mean has no resistance to outliers.", "Mean."]
    assert (
        contradiction(_check("Which suits (20, 22, 19, 35, 21, 20, 18)?", resistant, 0))
        is None
    )


def test_a_median_asked_about_in_passing_is_not_refused():
    table = "| Fruit | Number of students |\n|---|---|\n| Mango | 9 |\n| Banana | 6 |\n| Orange | 8 |"
    question = f"Which fruit is the mode? Why can't we find a median?\n{table}"
    assert contradiction(_check(question, ["Mango", "Banana"], 0)) is None


@pytest.mark.parametrize(
    "question",
    [
        "Which of these is NOT 184 rounded to the nearest ten?",
        "Round 184 to the nearest 0.",
        "Round 184 to 40 decimal places.",
    ],
)
def test_rounding_questions_that_ask_something_else_or_cannot_be_worked_are_left_alone(
    question,
):
    assert verdict(question, ["180", "190", "200"], 1).found is Found.NOT_COMPUTABLE


def test_rounded_to_a_number_of_places_is_worked_out():
    assert _found(
        "The sum is rounded to 2 decimal places: 3.14159. What is it?",
        ["3.14", "3.15", "3.1"],
        1,
    ) == (
        Found.WRONG_KEY,
        (0,),
    )


def test_the_lcd_of_a_fraction_and_a_whole_number_is_the_fractions_denominator():
    assert _found("What is the LCD of 3/4 and 5?", ["4", "20", "5", "9"], 1) == (
        Found.WRONG_KEY,
        (0,),
    )

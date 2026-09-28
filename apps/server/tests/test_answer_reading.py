"""Answer options and maths as lessons write them, read as exact numbers in
the form they are written."""

from fractions import Fraction

import pytest

from app.domains.lesson.answers.maths_text import plain_maths
from app.domains.lesson.answers.tokens import Form, numbers_in, tokens
from app.domains.lesson.answers.written import written


@pytest.mark.parametrize(
    ("text", "plain"),
    [
        (r"\(\frac{2}{5}\)", "2⁄5"),
        (r"$\frac{2}{5}$", "2⁄5"),
        (r"\(\dfrac{3}{4}\)", "3⁄4"),
        (r"\(2\frac{1}{2}\)", "2 1⁄2"),
        (r"<latex-inline>\frac{7}{8}</latex-inline>", "7⁄8"),
        (r"\(0.6 \times 3.5\)", "0.6 × 3.5"),
        (r"\(12 \div 4\)", "12 ÷ 4"),
        (r"40\%", "40%"),
        (r"\(10\,000\) cm", "10000 cm"),
        ("1 000 cm", "1000 cm"),
        (r"\(\text{₦}7\)", "₦7"),
        (r"\(0.\overline{3}\)", "0.[3]"),
        (r"\(3^{2}\)", "3^2"),
        ("2½", "2 1⁄2"),
        (r"\(2\,\frac{125}{200}\)", "2 125⁄200"),
        (r"\(\frac{\frac{1}{2}}{3}\)", "((1⁄2)/(3))"),
        ("3.5 kg = \\_\\_\\_ g", "3.5 kg = _ g"),
    ],
)
def test_latex_is_read_as_plain_maths(text, plain):
    assert plain_maths(text) == plain


@pytest.mark.parametrize(
    ("option", "value", "form"),
    [
        (r"\(\frac{2}{5}\)", Fraction(2, 5), Form.FRACTION),
        (r"$\frac{2}{5}$", Fraction(2, 5), Form.FRACTION),
        ("0.4", Fraction(2, 5), Form.DECIMAL),
        (r"40\%", Fraction(2, 5), Form.PERCENT),
        ("40 %", Fraction(2, 5), Form.PERCENT),
        ("87.5%", Fraction(7, 8), Form.PERCENT),
        ("2 1/2", Fraction(5, 2), Form.MIXED),
        (r"\(2\frac{1}{2}\)", Fraction(5, 2), Form.MIXED),
        ("7/4", Fraction(7, 4), Form.FRACTION),
        ("x = 4", Fraction(4), Form.WHOLE),
        (r"\(y = -3\)", Fraction(-3), Form.WHOLE),
        (r"-<latex-inline>\frac{1}{8}</latex-inline>", Fraction(-1, 8), Form.FRACTION),
        ("2.10", Fraction(21, 10), Form.DECIMAL),
        ("1,000", Fraction(1000), Form.WHOLE),
        (r"\(0.\overline{3}\)", Fraction(1, 3), Form.DECIMAL),
        (r"\(0.1\dot{6}\)", Fraction(1, 6), Form.DECIMAL),
        ("0.4.", Fraction(2, 5), Form.DECIMAL),
    ],
)
def test_an_option_is_its_exact_number_in_the_form_it_is_written(option, value, form):
    read = written(option)

    assert (read.value, read.form) == (value, form)


@pytest.mark.parametrize(
    ("option", "value", "unit"),
    [
        ("250 cm", Fraction(250), "cm"),
        ("2.5 m", Fraction(5, 2), "m"),
        ("0.75 kg", Fraction(3, 4), "kg"),
        ("₦300", Fraction(300), "naira"),
        ("N300", Fraction(300), "naira"),
        ("500 kobo", Fraction(500), "kobo"),
        ("1 000 cm", Fraction(1000), "cm"),
        ("3 litres", Fraction(3), "l"),
    ],
)
def test_an_option_keeps_its_unit(option, value, unit):
    read = written(option)

    assert (read.value, read.unit.name) == (value, unit)


def test_only_a_fraction_in_its_lowest_terms_is_lowest():
    assert written("3/5").lowest
    assert not written("6/10").lowest
    assert not written("4/1").lowest
    assert not written("2 2/4").lowest


@pytest.mark.parametrize(
    "option",
    [
        "30 oranges",
        "0.333...",
        "0.33…",
        "2,5",
        "None of these",
        "12:8",
        "9 : 20, which is 45 %",
        "0.6 and 60%",
        "3 r 1",
        "2 3/2",
        "5/0",
        r"\(x^2\)",
        "₦5%",
        "",
    ],
)
def test_an_option_that_is_more_or_other_than_one_number_is_not_read(option):
    assert written(option) is None


def test_text_with_a_character_the_checks_cannot_read_is_not_read():
    assert tokens("2 ≈ 2.0") is None
    assert tokens("3 – 1") is None


def test_numbers_in_feedback_are_found_whatever_is_around_them():
    found = list(numbers_in(plain_maths(r"Right! \(\frac{2}{5}\) = 0.4, or 40%.")))

    assert [(number.value, number.form) for number in found] == [
        (Fraction(2, 5), Form.FRACTION),
        (Fraction(2, 5), Form.DECIMAL),
        (Fraction(2, 5), Form.PERCENT),
    ]

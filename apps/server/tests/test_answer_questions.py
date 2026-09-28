"""Which questions are worked out in code, and their exact answers. A
question the checks cannot be sure of is left alone: a check refused wrongly
is worse than one not checked."""

from fractions import Fraction

import pytest

from app.domains.lesson.answers.asked import Worked
from app.domains.lesson.answers.question import asked
from app.domains.lesson.answers.tokens import Form


@pytest.mark.parametrize(
    ("question", "answer", "worked"),
    [
        (r"Which decimal is equal to \(\frac{2}{5}\)?", Fraction(2, 5), "conversion"),
        ("Write 2/5 as a decimal.", Fraction(2, 5), "conversion"),
        ("Which fraction is equivalent to 0.6?", Fraction(3, 5), "conversion"),
        (
            r"What is the percentage equivalent of the fraction \(\frac{7}{8}\)?",
            Fraction(7, 8),
            "conversion",
        ),
        ("Simplify: 2/3 + 1/4", Fraction(11, 12), "arithmetic"),
        (r"Evaluate \(0.25 \times 12\)", Fraction(3), "arithmetic"),
        (r"What is \(1.75 \times 0.6\)?", Fraction(21, 20), "arithmetic"),
        (r"\(\frac{3}{4} + \frac{1}{8} = ?\)", Fraction(7, 8), "arithmetic"),
        (r"What is \(\frac{3}{8} - \frac{1}{4}\)?", Fraction(1, 8), "arithmetic"),
        ("Work out 12 - 3 × 2", Fraction(6), "arithmetic"),
        ("Calculate (12 - 3) × 2", Fraction(18), "arithmetic"),
        ("What is 1/2 of 3/4 + 1?", Fraction(11, 8), "arithmetic"),
        (r"What is \(3^2 + 4^2\)?", Fraction(25), "arithmetic"),
        ("What is -3 + 5?", Fraction(2), "arithmetic"),
        ("What is 3/4 of 20?", Fraction(15), "arithmetic"),
        ("What is 20 % of ₦50?", Fraction(10), "arithmetic"),
        ("What is 15% of ₦2,000?", Fraction(300), "arithmetic"),
        ("Express 3/8 as a percentage", Fraction(3, 8), "conversion"),
        (
            "Convert 45% to a fraction in its lowest terms",
            Fraction(9, 20),
            "conversion",
        ),
        (
            r"Change \(2\frac{3}{4}\) to an improper fraction",
            Fraction(11, 4),
            "conversion",
        ),
        (
            "Express 0.125 as a fraction in its lowest terms",
            Fraction(1, 8),
            "conversion",
        ),
        ("Write 7/4 as a mixed number", Fraction(7, 4), "conversion"),
        ("Reduce 12/16 to its lowest terms", Fraction(3, 4), "conversion"),
        ("How many grams are in 3.5 kg?", Fraction(3500), "units"),
        ("Convert 2.5 m to cm", Fraction(250), "units"),
        ("Convert 450 cm to metres", Fraction(9, 2), "units"),
        ("Express 90 minutes in hours", Fraction(3, 2), "units"),
        ("How many kobo are in ₦5?", Fraction(500), "units"),
        ("3.5 kg = ___ g", Fraction(3500), "units"),
        ("What is 750 g + 250 g?", Fraction(1000), "arithmetic"),
        ("Solve for x: 3x - 5 = 10", Fraction(5), "equation"),
        ("Find the value of y in 4y + 2 = 18", Fraction(4), "equation"),
        (r"Solve \(2(x + 3) = 14\)", Fraction(4), "equation"),
        (r"Solve \(\frac{x}{3} = 4\)", Fraction(12), "equation"),
        ("Solve 7x - 15 = 2x + 30", Fraction(9), "equation"),
        ("If 5y = 35, what is y?", Fraction(7), "equation"),
        ("Solve 0.5x + 1.5 = 4", Fraction(5), "equation"),
        ("If 5y = 35, what is the value of y?", Fraction(7), "equation"),
        (
            (
                r"Solve the equation \(8z - 24 = 40\) and verify your solution by "
                r"substitution. What is the correct value of \(z\)?"
            ),
            Fraction(8),
            "equation",
        ),
        (r"Solve \(2x = 10\). What is the value of \(x\)?", Fraction(5), "equation"),
        # A fraction written as one is one number beside a division.
        (r"What is \(\frac{3}{4} \div \frac{1}{2}\)?", Fraction(3, 2), "arithmetic"),
        (r"What is \(12 \div \frac{6}{2}\)?", Fraction(4), "arithmetic"),
        ("What is 24 × 4 ÷ 2?", Fraction(48), "arithmetic"),
        ("What is (24 ÷ 4) × 2?", Fraction(12), "arithmetic"),
        ("What is 24 ÷ 4 + 2 × 3?", Fraction(12), "arithmetic"),
        ("What is 1 1/2 of 10?", Fraction(15), "arithmetic"),
        # Joined in words.
        (
            r"What is the sum of \(\frac{1}{4}\) and \(\frac{1}{6}\)?",
            Fraction(5, 12),
            "arithmetic",
        ),
        (
            "What is the correct sum of ₦1,250.50 and ₦750.30?",
            Fraction(20008, 10),
            "arithmetic",
        ),
        ("Find the product of 0.6 and 3.5", Fraction(21, 10), "arithmetic"),
        # What is counted, named after the maths.
        ("What is 20 % of 150 mangoes sold at the market?", Fraction(30), "arithmetic"),
        ("What is 45% of 80 points?", Fraction(36), "arithmetic"),
        ("How many grams are in **2.5 kilograms** of beans?", Fraction(2500), "units"),
        (
            "How many millilitres are in a 1.2 L bottle of water?",
            Fraction(1200),
            "units",
        ),
        (
            "What is the length of 250 cm when expressed in metres?",
            Fraction(5, 2),
            "units",
        ),
        ("What is the mass of 3 kilograms in grams?", Fraction(3000), "units"),
        (
            "What is the correct conversion of 4500 mL to litres?",
            Fraction(9, 2),
            "units",
        ),
        (
            "What is 3/4 + 1/8? Give your answer in its simplest form.",
            Fraction(7, 8),
            "arithmetic",
        ),
        (
            r"What decimal represents \( \frac{3}{10} \) kilogram?",
            Fraction(3, 10),
            "conversion",
        ),
    ],
)
def test_a_question_to_work_out_has_its_exact_answer(question, answer, worked):
    found = asked(question)

    assert (found.value, found.worked) == (answer, Worked(worked))


@pytest.mark.parametrize(
    ("question", "form", "lowest", "improper"),
    [
        ("Write 2/5 as a decimal.", Form.DECIMAL, False, False),
        ("Which fraction is equivalent to 0.6?", Form.FRACTION, False, False),
        (
            r"What is 0.6 as a fraction in its simplest form?",
            Form.FRACTION,
            True,
            False,
        ),
        ("Simplify 12/16", None, True, False),
        ("Change 2 3/4 to an improper fraction", Form.FRACTION, False, True),
        ("Write 7/4 as a mixed number", Form.MIXED, False, False),
        ("Convert the fraction 3/4 to a decimal", Form.DECIMAL, False, False),
        (
            "Which of the following fractions is equal to 0.6?",
            Form.FRACTION,
            False,
            False,
        ),
        ("What is 3/4 + 1/8?", None, False, False),
        ("Which is equal to 0.6?", None, False, False),
    ],
)
def test_the_form_asked_for_is_read_from_the_question(question, form, lowest, improper):
    wanted = asked(question).wanted

    assert (wanted.form, wanted.lowest, wanted.improper) == (form, lowest, improper)


def test_a_unit_named_in_the_question_is_asked_for_and_one_worked_out_is_not():
    assert asked("Convert 2.5 m to cm").wanted.unit.name == "cm"
    assert asked("What is 750 g + 250 g?").wanted.unit is None
    assert asked("What is 750 g + 250 g?").unit.name == "g"


@pytest.mark.parametrize(
    "question",
    [
        # Word problems: the answer is not the arithmetic written in them.
        "Ada has ₦500 and spends ₦250. How much is left?",
        (
            "The class raised ₦2 000 for a book fair. They want to increase the "
            "amount by 25 %. How much more money must they raise?"
        ),
        "If you have 200 oranges and sell 15 % of them, how many oranges are sold?",
        "How much do 0.4 kg of tomatoes cost at 2.5 naira per kilogram?",
        (
            "At the market, you buy 2/5 kilogram of yams and later buy another 3/8 "
            "kilogram. How many kilograms of yams have you bought in total?"
        ),
        "What is the total amount of food you bought?",
        "What is 20% of 150 mangoes that were not sold?",
        "What is 20% of 150 mangoes left after the sale?",
        "What is 3/4 of 20 oranges shared between friends?",
        "What is 45% of 80 points? Then take away 6.",
        "What is 45% of 80 points? Give each share.",
        "At the market, what is 20% of 150 mangoes?",
        "What is the sum of 1/4 and 1/6 and 1/8?",
        "What is the difference between 3/4 and 1/2?",
        "What is 20% of 150 per day?",
        "A sack of beans weighs 3 kg. How many grams is this?",
        "What percentage of the 2 GB data bundle has been used?",
        r"What decimal represents \(\frac{5}{10}\) kilogram of rice?",
        "How many 0.25 kg bags are in 0.75 kg?",
        # Comparing, estimating, rounding.
        "Which is bigger, 1/2 or 1/3?",
        "Which is greater: 0.5 or 0.45?",
        "Round 3.46 to one decimal place.",
        "What is 1/3 + 1/4 to the nearest tenth?",
        # Questions about a number, not its value.
        "What is the numerator of 3/5?",
        "What is the place value of 7 in 0.573?",
        "What is 2/5?",
        "What is 40%?",
        "How many tenths are in 0.6?",
        (
            "Which fraction is equivalent to 3/5 after multiplying numerator and "
            "denominator by 2?"
        ),
        # Negation.
        "Which of these is not equal to 0.6?",
        # Two answers asked for.
        r"What is the correct decimal and percentage for the fraction \(\frac{2}{3}\)?",
        "Write 3/4 as a decimal and as a percentage.",
        # Equations asking for something other than the letter, or saying
        # more after it than a question for the letter.
        (
            r"What is the value of \(x\) in the equation \(5x + 30 = 130\) "
            "that represents the number of phone-credit units bought?"
        ),
        "What is the coefficient of x in 5x + 30 = 130?",
        "If x = 3, what is 2x + 1?",
        "What is the first step to solve 3x + 5 = 20?",
        "Find the number you add to both sides of x - 5 = 12.",
        "What is 2x if 3x + 1 = 7?",
        "The equation 5x + 30 = 130 shows the credit bought. How many units?",
        "Solve x^2 = 9",
        "Solve 2x = 10 to find the cost of one pen. How much do two pens cost?",
        "Solve x + 5 = 12. How old will she be in one year?",
        (
            "Solve 5x = 35 to find the number of pupils in each row. How many "
            "pupils are in all the rows?"
        ),
        "Solve 2x = 10. What is the total?",
        "Solve 2x = 10 and check how much two pens cost.",
        "Solve 2x = 10 and verify the cost of one pen.",
        "Solve 2x = 10, so how much is 3x?",
        # "of" between whole numbers asks what part one is of the other.
        "What percentage is 20 of 80?",
        "What fraction is 15 of 60?",
        "Write 3 of 8 as a fraction",
        "What is 6 of 10 as a percentage?",
        "What decimal is 3 of 4?",
        "How many are 3 of 4 equal parts?",
        "What is 0.5 of 20?",
        # A division that reads two ways.
        "What is 8 ÷ 2(2 + 2)?",
        "What is 12 ÷ 6/2?",
        "Evaluate 24 ÷ 4 × 2",
        "What is 24 ÷ 4 ÷ 2?",
        "What is 3/4 ÷ 1/2?",
        "What is 6/2 ÷ 3?",
        "What is 6 ÷ 2x?",
        "Solve 2x + 3y = 12",
        "Solve 2x + 3 = 2x + 5",
        # Units that do not add up, or were not asked.
        "What is 2 m + 30 cm?",
        "What is 3 kg × 2 kg?",
        "Convert 2.5 m to kg",
        "What is 50 + 10%?",
        # Ratios, and anything else not read.
        "Express 12:8 in its simplest form",
        "Simplify 3x + 2x",
        "What is 7 ÷ 0?",
        "What is -3^2?",
        "Solve 1/2x = 4",
        "What is 2^100?",
        "",
    ],
)
def test_a_question_the_checks_cannot_be_sure_of_is_left_alone(question):
    assert asked(question) is None

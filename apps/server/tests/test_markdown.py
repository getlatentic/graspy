"""repair_markdown rewrites every character a learner reads, so each rule is
pinned separately: a regex that changes behaviour silently changes lessons.
"""

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.domains.lesson.markdown import repair_markdown


@pytest.mark.parametrize("value", ["", None])
def test_falsy_input_passes_through(value):
    assert repair_markdown(value) == value


def test_at_proxy_becomes_a_backslash():
    """@@ is read as a backslash."""
    assert repair_markdown("$@@alpha$") == "<latex-inline>\\alpha</latex-inline>"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("\tfrac", "\\tfrac"),
        ("\rho", "\\rho"),
        ("\x0cor", "\\for"),
        ("\x08eta", "\\beta"),
        ("\rVert", "\\rVert"),
    ],
)
def test_control_characters_before_a_letter_are_restored(raw, expected):
    """JSON parsing turns "\\t" into a tab; the letter after it says it is
    meant as a LaTeX command."""
    assert repair_markdown(raw) == f"<latex-inline>{expected}</latex-inline>"


def test_a_tab_not_followed_by_a_letter_is_left_alone():
    assert repair_markdown("a\t b") == "a\t b"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("$$x+1$$", "<latex-block>x+1</latex-block>"),
        ("\\[x+1\\]", "<latex-block>x+1</latex-block>"),
        ("\\(x+1\\)", "<latex-inline>x+1</latex-inline>"),
        ("$x+1$", "<latex-inline>x+1</latex-inline>"),
    ],
)
def test_every_delimiter_reaches_one_pair_of_tags(raw, expected):
    assert repair_markdown(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("$$\nx\n$$", "<latex-block>\nx\n</latex-block>"),
        ("\\[\nx\n\\]", "<latex-block>\nx\n</latex-block>"),
        ("\\(x\ny\\)", "<latex-inline>x\ny</latex-inline>"),
    ],
)
def test_delimiters_span_newlines(raw, expected):
    assert repair_markdown(raw) == expected


def test_trailing_newline_moves_outside_the_bold_run():
    assert repair_markdown("**Title:\n**") == "**Title:**\n"


@pytest.mark.parametrize(
    "text",
    [
        "The **binary** system is used in computers.\n\n**Key Points:**\n- Base 10",
        "**Base-10** uses ten digits.\n**Binary** uses two.",
        "Say **yes**\n** or no",
    ],
)
def test_bold_runs_on_separate_lines_are_left_alone(text):
    """The closing ** of one phrase and the opening ** of the next are not a
    broken bold run. Pairing them moved the markers onto the wrong words and
    a slide showed 'code.** Key Points:**'."""
    assert repair_markdown(text) == text


def test_tikz_is_fenced_for_the_renderer():
    picture = "\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}"

    assert repair_markdown(f"See:\n{picture}") == f"See:\n\n```tikz\n{picture}\n```\n"


@pytest.mark.parametrize(
    "prose",
    [
        "A shirt costs $20 and a hat costs $15.",
        "Ade has $5. Bola has $3. How much altogether?",
        "The price rose from $10 to $12 in 2023.",
    ],
)
def test_money_in_a_word_problem_is_not_read_as_maths(prose):
    """Two prices in one sentence must not swallow the prose between them and
    render it as italic maths."""
    assert repair_markdown(prose) == prose


def test_a_price_and_a_real_expression_can_share_a_sentence():
    assert (
        repair_markdown("Cost $50 for $x$ items")
        == "Cost $50 for <latex-inline>x</latex-inline> items"
    )


def test_plain_prose_is_untouched():
    prose = "Water is H2O. Photosynthesis needs light."
    assert repair_markdown(prose) == prose


@given(st.text(alphabet=st.characters(blacklist_characters="$\\@\t\r\x08\x0c*")))
def test_text_without_any_markup_is_returned_unchanged(value):
    """Nothing but the delimiters above may alter a learner's text."""
    assert repair_markdown(value) == value


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("$$A B C D E$$", "A B C D E"),
        ("Letters: @@(A, B, C, D@@).", "Letters: A, B, C, D."),
    ],
)
def test_a_list_of_letters_is_text_not_maths(raw, expected):
    """The alphabet in a maths span rendered as italic maths letters."""
    assert repair_markdown(raw) == expected


@pytest.mark.parametrize("maths", ["$$a + b = c$$", "$x$", "$$A B C$$"])
def test_real_maths_and_short_variable_lists_stay_maths(maths):
    assert "<latex-" in repair_markdown(maths)


def test_phonetic_letters_outside_maths_become_unicode():
    """The learner read "/\\ae/" where the model meant the sound /æ/."""
    assert (
        repair_markdown('the sound /@@ae/ as in "apple"')
        == 'the sound /æ/ as in "apple"'
    )


def test_phonetic_commands_inside_maths_are_left_for_katex():
    assert repair_markdown("$@@o$") == "<latex-inline>\\o</latex-inline>"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("ìdá kan ( @@frac12)", "ìdá kan ( <latex-inline>\\frac12</latex-inline>)"),
        ("x @@times 3", "x <latex-inline>\\times</latex-inline> 3"),
        (
            "@@frac{@@sqrt{2}}{3} m",
            "<latex-inline>\\frac{\\sqrt{2}}{3}</latex-inline> m",
        ),
    ],
)
def test_a_command_written_without_delimiters_becomes_maths(raw, expected):
    """Outside a maths span nothing renders it, and the learner read "\\frac12"."""
    assert repair_markdown(raw) == expected


@pytest.mark.parametrize("text", ["run `@@n` to break a line", "$@@frac{1}{2}$"])
def test_code_and_delimited_maths_are_not_wrapped_again(text):
    assert repair_markdown(text).count("<latex-inline>") == text.count("$") // 2


def test_backslashes_doubled_as_if_for_json_are_undone():
    """Found in Nova's plain-text fields: every command written with two."""
    assert (
        repair_markdown(r"Half is \\(\\frac{1}{2}\\).")
        == r"Half is <latex-inline>\frac{1}{2}</latex-inline>."
    )


def test_a_latex_line_break_is_not_mistaken_for_a_doubled_backslash():
    aligned = r"\[\begin{aligned} a &= 1 \\ b &= 2 \end{aligned}\]"

    assert (
        repair_markdown(aligned)
        == r"<latex-block>\begin{aligned} a &= 1 \\ b &= 2 \end{aligned}</latex-block>"
    )


def test_a_line_break_with_extra_space_is_kept():
    cases = r"\[\begin{cases} x = 3,\\[4pt] x = 2 \end{cases}\]"

    assert (
        repair_markdown(cases)
        == r"<latex-block>\begin{cases} x = 3,\\[4pt] x = 2 \end{cases}</latex-block>"
    )

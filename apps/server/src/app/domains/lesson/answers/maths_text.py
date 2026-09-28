r"""Maths as a lesson writes it, as plain text: "\(\frac{2}{5}\)" is "2/5",
"\(2\frac{1}{2}\)" is "2 1/2" and "40\%" is "40%". A command with no plain
form is left as it is, so the text does not read as a number."""

from __future__ import annotations

import re

# A kept lesson's maths is tagged, as repair_markdown leaves it.
_TAGS = re.compile(r"</?latex-(?:inline|block)>")
_DELIMITERS = re.compile(r"\\[()\[\]]|\$")
_WRAPPER = re.compile(
    r"\\(?:text|mathrm|textrm|textbf|mathbf|operatorname)\{([^{}]*)\}"
)
_MIXED = re.compile(r"(\d+)\s*\\[dt]?frac\{\s*(\d+)\s*\}\{\s*(\d+)\s*\}")
_WHOLE_FRACTION = re.compile(r"\\[dt]?frac\{\s*(\d+)\s*\}\{\s*(\d+)\s*\}")
_FRACTION = re.compile(r"\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}")
_RECURRING = re.compile(r"\\(?:overline|dot)\{(\d+)\}")
_POWER = re.compile(r"\^\{(\d+)\}")
_BLANK = re.compile(r"(?:\\_|_){2,}|\\square|\\Box|□")
# Digits grouped in threes by a thin or no-break space, as "10\,000" and
# "1 000" are written; an ordinary space is left, as "2 1/2" needs it.
_GROUP_SPACE = re.compile(r"(?<=\d)[\u2009\u202f\u00a0](?=\d{3}(?![\d/]))")
_SPACES = re.compile(r"[\u2009\u202f\u00a0]|\\[;: !]|\\q?quad|~")
_UNICODE_FRACTION = re.compile(r"(\d?)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])")
_VULGAR = {
    "½": "1/2",
    "⅓": "1/3",
    "⅔": "2/3",
    "¼": "1/4",
    "¾": "3/4",
    "⅕": "1/5",
    "⅖": "2/5",
    "⅗": "3/5",
    "⅘": "4/5",
    "⅙": "1/6",
    "⅚": "5/6",
    "⅛": "1/8",
    "⅜": "3/8",
    "⅝": "5/8",
    "⅞": "7/8",
}
_SYMBOLS = (
    ("**", ""),
    ("\\,", "\u2009"),
    ("\\times", "×"),
    ("\\cdot", "×"),
    ("*", "×"),
    ("\\div", "÷"),
    ("\\%", "%"),
    ("\\left", ""),
    ("\\right", ""),
    ("\\displaystyle", ""),
    ("−", "-"),
    ("²", "^2"),
    ("³", "^3"),
)
# Fractions inside fractions are rare; each pass takes one level off.
_NESTING = 4


def _fractions(text: str) -> str:
    text = _MIXED.sub(r"\1 \2/\3", text)
    for _ in range(_NESTING):
        text = _WHOLE_FRACTION.sub(r"\1/\2", text)
        text = _FRACTION.sub(r"((\1)/(\2))", text)
    return text


def _vulgar(found: re.Match) -> str:
    whole, fraction = found.groups()
    written = _VULGAR[fraction]
    return f"{whole} {written}" if whole else written


def plain_maths(text: str) -> str:
    text = _DELIMITERS.sub(" ", _TAGS.sub(" ", text))
    text = _WRAPPER.sub(r"\1", text)
    text = _fractions(text)
    text = _RECURRING.sub(r"[\1]", text)
    text = _POWER.sub(r"^\1", text)
    text = _BLANK.sub(" _ ", text)
    for written, plain in _SYMBOLS:
        text = text.replace(written, plain)
    text = _UNICODE_FRACTION.sub(_vulgar, text)
    text = _GROUP_SPACE.sub("", text)
    return " ".join(_SPACES.sub(" ", text).split())

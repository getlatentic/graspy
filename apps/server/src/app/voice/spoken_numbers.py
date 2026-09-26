"""Shared spoken-number vocabulary and the tokenizer used by the deterministic evaluators."""

import re
import unicodedata
from dataclasses import dataclass
from enum import Enum

ONES = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
}
TENS = {
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}
# Yoruba cardinals after diacritics are stripped; "márùn-ún" and "mẹ́sàn-án" lose their suffix.
YORUBA_ONES = {
    "okan": 1,
    "eni": 1,
    "meji": 2,
    "eji": 2,
    "meta": 3,
    "eta": 3,
    "merin": 4,
    "erin": 4,
    "marun": 5,
    "arun": 5,
    "mefa": 6,
    "efa": 6,
    "meje": 7,
    "eje": 7,
    "mejo": 8,
    "ejo": 8,
    "mesan": 9,
    "esan": 9,
    "mewa": 10,
    "ewa": 10,
    "okanla": 11,
    "mejila": 12,
    "ejila": 12,
}
TIMES_WORDS = frozenset(
    {"times", "time", "x", "into", "multiply", "multiplied", "ilopo", "lopo"}
)
EQUALS_WORDS = frozenset(
    {"is", "equals", "equal", "na", "je", "be", "dey", "give", "gives", "make", "makes"}
)


class TokenKind(Enum):
    NUMBER = "number"
    TIMES = "times"
    EQUALS = "equals"


@dataclass(frozen=True, eq=False)
class Token:
    kind: TokenKind
    value: int | None = None
    merged: bool = False


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    without_marks = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    lowered = without_marks.lower().replace("\u00d7", " x ").replace("=", " = ")
    split_digits = re.sub(r"(?<=\d)(?=[a-z])|(?<=[a-z])(?=\d)", " ", lowered)
    words = re.sub(r"[^a-z0-9\s=-]", " ", split_digits).replace("-", " ")
    return " ".join(words.split())


def _tone_marked(word: str) -> bool:
    """Yoruba writes tone and vowel quality with combining marks; English and Pidgin do not."""
    return any(
        unicodedata.combining(character)
        for character in unicodedata.normalize("NFD", word)
    )


def spellings(word: str) -> list[str]:
    """The normalised forms a recognizer may write for one spoken word.

    A Yoruba numeral carries a trailing syllable and doubled vowels that speech recognition
    often drops, so `márùn-ún` comes back as `marun` and `mẹ́wàá` as `mewa`; accepting those is
    not leniency, they are the same word said the same way. Only tone-marked words are widened,
    so a hyphenated English answer like `twenty-four` is never satisfied by `twenty`, and the
    trailing syllable is dropped only from one hyphenated word, never from a phrase, so the days
    of the week do not all collapse onto the `Ọjọ́` they share.
    """
    normalised = normalize(word)
    if not _tone_marked(word):
        return [normalised]
    variants = {normalised, re.sub(r"(.)\1+", r"\1", normalised)}
    if "-" in word and " " not in word.strip():
        variants.add(normalised.replace(" ", ""))
        variants.add(normalised.split(" ", 1)[0])
    return sorted(variant for variant in variants if variant)


def spoken_numbers(transcript: str) -> list[int]:
    return [
        token.value for token in tokenize(transcript) if token.kind is TokenKind.NUMBER
    ]


def tokenize(transcript: str) -> list[Token]:
    words = normalize(transcript).split()
    tokens: list[Token] = []
    index = 0
    after_hundred = False
    while index < len(words):
        word = words[index]
        before = len(tokens)
        if (
            word == "hundred"
            and tokens
            and tokens[-1].kind is TokenKind.NUMBER
            and tokens[-1].value < 10
        ):
            tokens[-1] = Token(TokenKind.NUMBER, tokens[-1].value * 100)
            after_hundred = True
            index += 1
            continue
        if word == "and" and after_hundred:
            index += 1
            continue
        joined = after_hundred and words[index - 1] == "and"
        if word.isdigit():
            tokens.append(Token(TokenKind.NUMBER, int(word)))
        elif word in TENS:
            following = ONES.get(words[index + 1]) if index + 1 < len(words) else None
            if following is not None and following < 10:
                tokens.append(Token(TokenKind.NUMBER, TENS[word] + following))
                index += 1
            else:
                tokens.append(Token(TokenKind.NUMBER, TENS[word]))
        elif word in ONES:
            tokens.append(Token(TokenKind.NUMBER, ONES[word]))
        elif word in YORUBA_ONES:
            tokens.append(Token(TokenKind.NUMBER, YORUBA_ONES[word]))
        elif word in TIMES_WORDS:
            tokens.append(Token(TokenKind.TIMES))
        elif word in EQUALS_WORDS or word == "=":
            tokens.append(Token(TokenKind.EQUALS))
        if len(tokens) > before:
            if (
                joined
                and tokens[-1].kind is TokenKind.NUMBER
                and tokens[-1].value < 100
            ):
                # "one hundred and eight": the tens and units belong to the hundred just said.
                tokens[-2:] = [
                    Token(TokenKind.NUMBER, tokens[-2].value + tokens[-1].value)
                ]
            after_hundred = False
        index += 1
    return tokens


_UNITS = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
]
_TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def number_words(value: int) -> str:
    """English words for 0..999, the range a times-table lesson can speak."""
    if value < 20:
        return _UNITS[value]
    if value < 100:
        tens, units = divmod(value, 10)
        return _TENS[tens - 2] + (f"-{_UNITS[units]}" if units else "")
    hundreds, rest = divmod(value, 100)
    return f"{_UNITS[hundreds]} hundred" + (
        f" and {number_words(rest)}" if rest else ""
    )

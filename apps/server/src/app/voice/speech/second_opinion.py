"""When Whisper writes a spoken number as words that are no number, Intron is asked as well.

On staging recordings of a single spoken number, Whisper wrote words that were no number for two in five of
them ("then", "tim", "chin", "to me, sink" for ten), and almost never a wrong number. Intron, which is built
for Nigerian speech, read the number in nearly half of those. So a recording of a number answer that Whisper
could not read as one is also sent to Intron, and Intron's reading stands only if it is a number."""

import re

from ..exercises import FactAnswerExercise, SpokenAnswerExercise

NUMBER_WORDS = frozenset(
    [
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
        "twenty",
        "thirty",
        "forty",
        "fifty",
        "sixty",
        "seventy",
        "eighty",
        "ninety",
        "hundred",
        "thousand",
        "million",
        "nought",
        "nil",
        "dozen",
    ]
)
JOINING = frozenset({"and", "point"})
# A single spoken number is a word or two; anything longer is a sentence, which Whisper reads well.
MOST_WORDS = 4
MOST_NUMBER_WORDS = 6
# The child saying they cannot or will not, and what Whisper writes for silence: not an answer to be reread.
NOT_AN_ANSWER = re.compile(
    r"\b(know|remember|forgot|sure|idea|can'?t|cannot|don'?t|no|thanks?|okay|ok|hello|hi)\b",
    re.IGNORECASE,
)


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def carries_a_number(text: str) -> bool:
    return any(word.isdigit() or word in NUMBER_WORDS for word in _words(text))


def reads_as_a_number(text: str) -> bool:
    """Only a few words, every one of them a number or what joins one ("twenty one", "10", "one hundred and
    five"): a sentence that happens to hold a number word ("one more time") is no reading of a number."""
    words = _words(text)
    return (
        0 < len(words) <= MOST_NUMBER_WORDS
        and all(w.isdigit() or w in NUMBER_WORDS or w in JOINING for w in words)
        and carries_a_number(text)
    )


def expects_a_number(exercise) -> bool:
    if isinstance(exercise, FactAnswerExercise):
        return True
    return isinstance(exercise, SpokenAnswerExercise) and all(
        carries_a_number(answer) for answer in exercise.expected
    )


def wants_a_second_opinion(exercise, whisper_text: str) -> bool:
    """A number was asked for, and Whisper wrote a few words that are none and are not the child saying
    they do not know or cannot."""
    return (
        expects_a_number(exercise)
        and 0 < len(_words(whisper_text)) <= MOST_WORDS
        and not carries_a_number(whisper_text)
        and NOT_AN_ANSWER.search(whisper_text) is None
    )

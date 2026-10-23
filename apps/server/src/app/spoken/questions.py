"""Maths questions made in code, from a topic, a level and a seed, so the
answer is arithmetic and never a model's guess. The same three numbers always
make the same question, which is how a question is found again to be marked."""

from __future__ import annotations

import random
from collections.abc import Callable
from dataclasses import dataclass

NAMES = ("Ada", "Chidi", "Tunde", "Amina", "Emeka", "Zainab", "Bola", "Ngozi")
THINGS = ("mangoes", "oranges", "pencils", "bananas", "eggs", "books")
LEVELS = (1, 2, 3)


@dataclass(frozen=True)
class Question:
    topic: str
    level: int
    seed: int
    text: str
    answer: int
    hints: tuple[str, str]
    working: str

    @property
    def id(self) -> str:
        return f"{self.topic}.{self.level}.{self.seed}"


def _who(rng: random.Random) -> tuple[str, str]:
    return rng.choice(NAMES), rng.choice(THINGS)


def _addition(level: int, rng: random.Random) -> tuple[str, int, tuple[str, str], str]:
    low, high = {1: (2, 9), 2: (10, 60), 3: (50, 150)}[level]
    a, b = rng.randint(low, high), rng.randint(1, 9 if level == 1 else 60)
    name, thing = _who(rng)
    return (
        f"{name} has {a} {thing} and gets {b} more. How many {thing} does {name} have now?",
        a + b,
        (f"Start at {a} and count up {b}.", "Add the ones first, then the tens."),
        f"{a} plus {b} is {a + b}.",
    )


def _subtraction(
    level: int, rng: random.Random
) -> tuple[str, int, tuple[str, str], str]:
    low, high = {1: (5, 15), 2: (30, 99), 3: (100, 250)}[level]
    a = rng.randint(low, high)
    b = rng.randint(1, min(a - 1, 9 if level == 1 else 60))
    name, thing = _who(rng)
    return (
        f"{name} has {a} {thing} and gives away {b}. How many {thing} are left?",
        a - b,
        (
            f"Start at {a} and count back {b}.",
            "Take away the ones first, then the tens.",
        ),
        f"{a} take away {b} is {a - b}.",
    )


def _multiplication(
    level: int, rng: random.Random
) -> tuple[str, int, tuple[str, str], str]:
    table = rng.choice(
        {1: (2, 5, 10), 2: tuple(range(2, 11)), 3: (6, 7, 8, 9, 11, 12)}[level]
    )
    n = rng.randint(2, 10 if level < 3 else 12)
    name, thing = _who(rng)
    return (
        f"{name} has {n} bags with {table} {thing} in each bag. How many {thing} is that altogether?",
        n * table,
        (
            f"Add {table} again and again, {n} times.",
            f"Count in {table}s: {', '.join(str(table * i) for i in range(1, min(n, 4)))}, and keep going.",
        ),
        f"{n} times {table} is {n * table}.",
    )


def _division(level: int, rng: random.Random) -> tuple[str, int, tuple[str, str], str]:
    share = rng.choice({1: (2, 5, 10), 2: (2, 3, 4, 5, 6), 3: (6, 7, 8, 9, 12)}[level])
    each = rng.randint(2, 10 if level < 3 else 12)
    name, thing = _who(rng)
    return (
        f"{name} shares {share * each} {thing} equally among {share} friends. How many {thing} does each friend get?",
        each,
        (
            f"Ask: {share} times what number makes {share * each}?",
            f"Share them out one at a time to each of the {share} friends.",
        ),
        f"{share * each} shared among {share} is {each} each.",
    )


def _part_of_a_quantity(
    level: int, rng: random.Random
) -> tuple[str, int, tuple[str, str], str]:
    word, parts = rng.choice(
        {
            1: [("half", 2)],
            2: [("half", 2), ("a quarter", 4)],
            3: [("a third", 3), ("a fifth", 5), ("a quarter", 4)],
        }[level]
    )
    each = rng.randint(2, 9)
    name, thing = _who(rng)
    return (
        f"{name} has {parts * each} {thing}. What is {word} of them?",
        each,
        (
            f"{word.capitalize()} means sharing into {parts} equal groups.",
            f"Share {parts * each} into {parts} equal groups. How many are in one group?",
        ),
        f"{word.capitalize()} of {parts * each} is {each}.",
    )


MAKERS: dict[
    str, Callable[[int, random.Random], tuple[str, int, tuple[str, str], str]]
] = {
    "addition": _addition,
    "subtraction": _subtraction,
    "multiplication": _multiplication,
    "sharing": _division,
    "parts of a number": _part_of_a_quantity,
}
TOPICS = tuple(MAKERS)


def make(topic: str, level: int, seed: int) -> Question:
    text, answer, hints, working = MAKERS[topic](
        level, random.Random(f"{topic}.{level}.{seed}")
    )
    return Question(topic, level, seed, text, answer, hints, working)


def find(question_id: str) -> Question | None:
    """The question an id names, or None for an id that was not made here."""
    parts = question_id.rsplit(".", 2)
    if len(parts) != 3 or parts[0] not in MAKERS:
        return None
    try:
        topic, level, seed = parts[0], int(parts[1]), int(parts[2])
    except ValueError:
        return None
    return make(topic, level, seed) if level in LEVELS and 0 <= seed < 10**9 else None

"""Every spoken lesson line follows content/child-language.md, where a rule can be measured."""

import json
import re
from pathlib import Path

import pytest

from app.voice.speech.teacher_audio_contract import (
    published_utterance_ids,
    teacher_utterance,
)
from app.voice.spoken_numbers import number_words

PLANS_DIR = (
    Path(__file__).parents[1] / "src" / "app" / "voice" / "lesson_plans" / "plans"
)
# One list of rules, shared with the tutor's check on every line it writes for a child.
RULES = json.loads(
    (Path(__file__).parents[3] / "content" / "child-language.json").read_text()
)

EARLY = {"nursery_1", "nursery_2", "kindergarten"}
LOWER = {"primary_1", "primary_2", "primary_3"}
WORDS_PER_SENTENCE = RULES["words_per_sentence"]
WORDS_PER_LINE = RULES["words_per_line"]
WORDS_WHEN_UPPER_IS_TAUGHT = RULES["words_when_upper_is_taught"]
GROWN_UP_WORDS = tuple(RULES["grown_up_words"])
INVITATIONS = ("say", "count", "tell", "name", "sing", "read", "start", "show")
PIDGIN_WORDS = (
    "na",
    "dey",
    "wetin",
    "sabi",
    "wey",
    "una",
    "abeg",
    "don",
    "go school",
    "make we",
)
LONGEST_TRANSLATION = 1.5


def plans() -> list[dict]:
    return [json.loads(path.read_text()) for path in sorted(PLANS_DIR.rglob("*.json"))]


def band(plan: dict) -> str:
    classes = set(plan["classes"])
    if classes & EARLY:
        return "early"
    return "lower" if classes & LOWER else "upper"


def lines() -> list[tuple[str, dict, dict]]:
    return [
        (f"{plan['id']}:{event['id']}", plan, event)
        for plan in plans()
        for event in plan["events"]
    ]


LINES = lines()
IDS = [line_id for line_id, _, _ in LINES]


def sentences(text: str) -> list[str]:
    return [
        part.strip()
        for part in re.split(r"(?<=[.!?])\s+", text.strip())
        if part.strip()
    ]


def is_list(sentence: str) -> bool:
    """A counted or spelled sequence ("one, two, three", "A, B, C") is the lesson, not prose."""
    return sentence.count(",") >= 3


def prose(text: str) -> list[str]:
    return [sentence for sentence in sentences(text) if not is_list(sentence)]


def words(text: str) -> int:
    return len(re.findall(r"[\w'\u2019-]+", text))


@pytest.mark.parametrize(("line_id", "plan", "event"), LINES, ids=IDS)
def test_sentences_are_short_enough_for_the_youngest_class(line_id, plan, event):
    limit = WORDS_PER_SENTENCE[band(plan)]
    long = [
        sentence for sentence in prose(event["say"]["en"]) if words(sentence) > limit
    ]
    assert not long, f"over {limit} words: {long}"


@pytest.mark.parametrize(("line_id", "plan", "event"), LINES, ids=IDS)
def test_every_sentence_starts_with_a_capital(line_id, plan, event):
    """The words are read aloud and shown on screen, where a lower-case start reads as a mistake."""
    for language, text in event["say"].items():
        lower = [sentence for sentence in sentences(text) if sentence[0].islower()]
        assert not lower, f"{language}: {lower}"


@pytest.mark.parametrize(("line_id", "plan", "event"), LINES, ids=IDS)
def test_a_line_is_short_enough_to_hold_in_mind(line_id, plan, event):
    """Short sentences are good; what a young listener cannot hold is a long line."""
    teaching_upper = band(plan) == "upper" and event["event"] == "present_content"
    limit = WORDS_WHEN_UPPER_IS_TAUGHT if teaching_upper else WORDS_PER_LINE[band(plan)]
    spoken = " ".join(prose(event["say"]["en"]))
    assert words(spoken) <= limit, f"{words(spoken)} words, over {limit}"


@pytest.mark.parametrize(("line_id", "plan", "event"), LINES, ids=IDS)
def test_no_grown_up_or_computer_words(line_id, plan, event):
    for language, text in event["say"].items():
        found = [
            word
            for word in GROWN_UP_WORDS
            if re.search(rf"\b{word}\b", text, re.IGNORECASE)
        ]
        assert not found, f"{language}: {found}"


@pytest.mark.parametrize(("line_id", "plan", "event"), LINES, ids=IDS)
def test_english_lines_are_english(line_id, plan, event):
    """A child who chose English hears English; Pidgin belongs in the Pidgin line."""
    found = [
        word
        for word in PIDGIN_WORDS
        if re.search(rf"\b{word}\b", event["say"]["en"], re.IGNORECASE)
    ]
    assert not found, f"Pidgin in the English line: {found}"


@pytest.mark.parametrize(("line_id", "plan", "event"), LINES, ids=IDS)
def test_no_semicolons(line_id, plan, event):
    for language, text in event["say"].items():
        assert ";" not in text, f"{language}: split it into two sentences: {text}"


@pytest.mark.parametrize(("line_id", "plan", "event"), LINES, ids=IDS)
def test_numbers_are_spoken_as_words(line_id, plan, event):
    for language, text in event["say"].items():
        assert not re.search(r"\d", text), f"{language}: {text}"


@pytest.mark.parametrize(("line_id", "plan", "event"), LINES, ids=IDS)
def test_a_turn_ends_with_the_one_thing_to_do(line_id, plan, event):
    if "activity" not in event:
        return
    said = sentences(event["say"]["en"])
    invites = said[-1].endswith("?") or any(
        s.lower().startswith(INVITATIONS) for s in said
    )
    assert invites, f"ends without a question or an invitation: {said[-1]}"


FIXED_LINES = [
    (
        utterance_id,
        {
            lang: teacher_utterance(utterance_id, lang).text
            for lang in ("en", "yo", "pcm")
        },
    )
    for utterance_id in published_utterance_ids()
    if not utterance_id.startswith("plan.")
]


@pytest.mark.parametrize(
    ("line_id", "said"), FIXED_LINES, ids=[i for i, _ in FIXED_LINES]
)
def test_the_fixed_lines_follow_the_same_rules(line_id, said):
    """What she says after every answer is heard most of all, so it keeps the guide too."""
    for language, text in said.items():
        found = [
            w for w in GROWN_UP_WORDS if re.search(rf"\b{w}\b", text, re.IGNORECASE)
        ]
        assert not found, f"{language}: grown-up words {found}"
        assert not re.search(r"\d", text), f"{language}: numbers must be words"
        assert not [s for s in sentences(text) if s[0].islower()], (
            f"{language}: capital first"
        )
    english = said["en"]
    long = [s for s in prose(english) if words(s) > WORDS_PER_SENTENCE["lower"]]
    assert not long, f"over {WORDS_PER_SENTENCE['lower']} words: {long}"
    assert words(" ".join(prose(english))) <= WORDS_PER_LINE["lower"]
    for language in ("yo", "pcm"):
        assert words(said[language]) <= LONGEST_TRANSLATION * words(english) + 2, (
            language
        )


NUMBER = {number_words(value): value for value in range(1001)}
PRODUCT = re.compile(
    r"\b([a-z-]+) times ([a-z-]+) (?:is|na|jẹ́|ni) ([a-z-]+(?: hundred(?: and [a-z-]+)?)?)",
    re.IGNORECASE,
)


def wrong_products(text: str) -> list[str]:
    """Every "a times b is c" the teacher says, where c is not a times b."""
    wrong = []
    for a, b, c in PRODUCT.findall(text):
        a, b, c = (NUMBER.get(part.lower()) for part in (a, b, c))
        if None not in (a, b, c) and a * b != c:
            wrong.append(f"{a} x {b} = {c}")
    return wrong


@pytest.mark.parametrize(("line_id", "plan", "event"), LINES, ids=IDS)
def test_the_teacher_never_says_a_wrong_product(line_id, plan, event):
    """The app's promise is that the maths is never wrong, and that includes what she says."""
    for language, text in event["say"].items():
        assert not wrong_products(text), f"{language}: {wrong_products(text)} in {text}"


@pytest.mark.parametrize(
    ("line_id", "said"), FIXED_LINES, ids=[i for i, _ in FIXED_LINES]
)
def test_no_fixed_line_says_a_wrong_product(line_id, said):
    for language, text in said.items():
        assert not wrong_products(text), f"{language}: {wrong_products(text)}"


@pytest.mark.parametrize("table", range(1, 13))
def test_a_times_table_is_taught_as_groups_of_its_own_number(table):
    """Four times three is three groups of four: the four times table counts in fours."""
    plan = next(
        p for p in plans() if p["id"] == f"mathematics.multiplication.table-{table}"
    )
    present = next(event for event in plan["events"] if event["id"] == "present")
    present = present["say"]["en"].lower()
    assert f"three groups of {number_words(table)}" in present, present


ASKED_FACT = re.compile(r"mul_fact_(\d+)x(\d+)_")


@pytest.mark.parametrize(("line_id", "plan", "event"), LINES, ids=IDS)
def test_a_line_asks_for_the_fact_its_activity_marks(line_id, plan, event):
    """A child who answers the question they heard must be marked against that same question."""
    asked = ASKED_FACT.match((event.get("activity") or {}).get("prompt_id", ""))
    if asked is None:
        return
    a, b = (number_words(int(n)) for n in asked.groups())
    for language, text in event["say"].items():
        assert f"{a} times {b}" in text.lower(), (
            f"{language} must ask {a} times {b}: {text}"
        )


def test_the_product_check_catches_a_wrong_line():
    assert wrong_products("Eleven times three is forty-eight.") == ["11 x 3 = 48"]
    assert wrong_products("Eleven times three na thirty-three.") == []
    assert wrong_products("Twelve times twelve is one hundred and forty-four.") == []


@pytest.mark.parametrize(("line_id", "plan", "event"), LINES, ids=IDS)
def test_translations_keep_the_child_waiting_no_longer(line_id, plan, event):
    english = words(event["say"]["en"])
    for language in ("pcm", "yo"):
        assert words(event["say"][language]) <= LONGEST_TRANSLATION * english + 2, (
            language
        )

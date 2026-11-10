"""What the safety rules stop in a reply by its words, and the ordinary school
sentences they leave alone (the labelled cases of scripts/safety_cases.json)."""

import json
from pathlib import Path

import pytest

from app.agent.safety_rules import Unsafe, unsafe_in

CASES = json.loads(
    (Path(__file__).parents[1] / "scripts" / "safety_cases.json").read_text()
)["cases"]
RULE_CATEGORIES = {"profanity", "contact", "personal_ask", "personal_claim"}
# What the rules leave to the judge: a mild insult, a link or number given as a way to reach
# someone (a CV lesson shows made-up ones), and a request that needs the sentence around it.
JUDGE_ONLY = {
    "unsafe-profanity-1",
    "unsafe-contact-0",
    "unsafe-contact-1",
    "unsafe-contact-2",
    "unsafe-contact-4",
    "unsafe-personal_ask-5",
    "real-helpline",
}
UNSAFE = [
    c
    for c in CASES
    if c["label"] == "unsafe"
    and c["category"] in RULE_CATEGORIES
    and c["id"] not in JUDGE_ONLY
]
SAFE = [c for c in CASES if c["label"] == "safe"]


def found(case: dict):
    return unsafe_in(case["text"], case.get("learner_said", ""))


@pytest.mark.parametrize("case", UNSAFE, ids=lambda c: c["id"])
def test_a_reply_the_rules_know_is_stopped(case):
    assert found(case) is not None


@pytest.mark.parametrize("case", SAFE, ids=lambda c: c["id"])
def test_an_ordinary_school_sentence_is_left_alone(case):
    assert found(case) is None


@pytest.mark.parametrize(
    ("sentence", "reason"),
    [
        ("What is your home address?", Unsafe.ASKS_PERSONAL),
        ("Your name is Chidinma.", Unsafe.INVENTS_PERSONAL),
        ("Add me on Instagram.", Unsafe.CONTACT),
        ("You idiot.", Unsafe.ABUSE),
    ],
)
def test_each_reason_is_named(sentence, reason):
    assert unsafe_in(sentence, "") is reason


def test_a_detail_the_learner_gave_is_not_invented():
    assert unsafe_in("Your name is Chidinma.", "My name is Chidinma") is None
    assert (
        unsafe_in("Your name is Chidinma.", "My name is Ada") is Unsafe.INVENTS_PERSONAL
    )


def test_a_part_of_a_detail_is_not_enough():
    assert (
        unsafe_in("You live in Ikeja Lagos.", "I am from Lagos")
        is Unsafe.INVENTS_PERSONAL
    )


def test_telling_a_child_not_to_share_is_not_asking_for_it():
    assert unsafe_in("Never share your password.", "") is None
    assert unsafe_in("Tell me your password.", "") is Unsafe.ASKS_PERSONAL


def test_a_sum_with_big_numbers_is_not_a_phone_number():
    assert unsafe_in("The total is 12,345,678 naira, or 20 000 000 kobo.", "") is None


def test_a_link_or_a_number_in_a_cv_lesson_is_left_to_the_judge():
    assert unsafe_in("Example: +234 803 123 4567 or ada@email.com", "") is None


def test_an_invitation_to_reach_the_tutor_outside_the_app_is_stopped():
    assert unsafe_in("Add me on WhatsApp.", "") is Unsafe.CONTACT
    assert unsafe_in("Join my Telegram group.", "") is Unsafe.CONTACT


def test_an_instruction_for_a_letter_is_not_a_request_for_the_detail():
    assert unsafe_in("Then type your full name under the closing.", "") is None


def test_a_condition_about_where_a_child_lives_is_not_a_claim():
    assert (
        unsafe_in("Sleep under a net, especially if you live near water.", "") is None
    )
    assert unsafe_in("You live in Ikeja.", "") is Unsafe.INVENTS_PERSONAL


def test_a_sentence_for_a_letter_may_say_call_me():
    assert unsafe_in("Add: Please feel free to call me if you need more.", "") is None

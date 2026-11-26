"""The form that asks a new learner where they go to school: their country and class on one
card, and what the server does with the answer."""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from functools import cache

from ..education.catalogue import countries, of_country
from ..education.route import descriptor
from .cards import (
    FORM_DESCRIPTION,
    AboutYou,
    Card,
    DetailsCard,
    DetailsResult,
    ResultMeta,
    TextContent,
)
from .context import LearnerContext
from .details import AFTER_SCHOOL, DETAILS_KEPT, MAX_DETAIL, classes_of, kept
from .memory import Exchange
from .refusal import refusal
from .reply import Action, Outcome, SetDetails

# What the model reads of the form it asked: the card is the whole of the question.
FORM_TOLD = (
    "The app shows the learner a short form as a card below your answer, asking their "
    "country and class. Write one short line and nothing else with it: no course, "
    "subject or lesson, never that anything is ready, and never the form's questions "
    "again. Their answer arrives as their next message."
)
# The line of a form the model did not ask for.
DEFAULT_LINE = "First, tell me a little about you."

# The message the form sends, in the words the server reads back, whatever the learner's language:
# "Country: Slovakia (SK). Class: Grade 7." and, after school, "... Class: Undergraduate. Course: Law."
ANSWER = re.compile(
    r"Country: (?P<name>.+?) \((?P<code>[A-Z]{2})\)\. "
    r"Class: (?P<class>.+?)(?:\. Course: (?P<course>.+))?\."
)


NAME_REFUSED = "<>{}[]\\\n"
MAX_WORD = 25


@dataclass(frozen=True)
class Answer:
    details: SetDetails
    country_code: str


@cache
def _class_lists() -> tuple[list[list[str]], dict[str, int]]:
    """Every catalogue country's classes. Countries mostly share a list, so each distinct list is
    sent once and a country names the one it has."""
    lists: list[list[str]] = []
    placed: dict[tuple[str, ...], int] = {}
    list_of: dict[str, int] = {}
    for code in sorted(countries()):
        names = tuple(classes_of(code))
        if names not in placed:
            placed[names] = len(lists)
            lists.append(list(names))
        list_of[code] = placed[names]
    return lists, list_of


def preselected(context: LearnerContext) -> str | None:
    """Where the form starts: the country the learner has said, else the one Cloudflare placed the
    connection in, else the device's guess. Only the first is known to be theirs."""
    return context.country_code or context.edge_country or context.device_country


def form_for(context: LearnerContext) -> AboutYou:
    lists, list_of = _class_lists()
    known = context.country_code if context.country_code in list_of else None
    shown = [known] if known else sorted(list_of)
    return AboutYou(
        country=preselected(context),
        ask_country=known is None,
        countries=shown,
        class_lists=lists,
        class_list_of={code: list_of[code] for code in shown},
        after_school=list(AFTER_SCHOOL),
    )


def form_card(context: LearnerContext) -> DetailsCard:
    form = form_for(context)
    return DetailsCard(
        tool_input={},
        tool_result=DetailsResult(
            content=[TextContent(text=form.describe())],
            structured_content=form,
            meta=ResultMeta(view_uuid=uuid.uuid4().hex),
        ),
    )


def ask_about_you_tool(context: LearnerContext) -> Callable[[], dict | Outcome]:
    def ask_about_you() -> dict | Outcome:
        """Ask the learner their country and class on one short form shown below
        your answer. Use it when their class is not given and what they want needs
        it, such as a school subject or a course. The form starts on the country
        their connection suggests, for them to confirm or change, so never ask
        their country or class in words, and never their age. Their answer arrives
        as their next message and the app saves it.
        """
        if kept(context):
            return refusal(DETAILS_KEPT)
        return Outcome(told={"done": FORM_TOLD}, card=form_card(context))

    return ask_about_you


def answer_in(message: str, context: LearnerContext) -> Answer | None:
    """The details the learner's message gives when it is the form's answer. A country outside the
    catalogue, a class the country does not have, or a level after school with no course is not an
    answer, and the message is left to the tutor."""
    found = ANSWER.fullmatch(message.strip())
    if found is None or kept(context):
        return None
    code = found["code"]
    if code not in countries() or context.country_code not in (None, code):
        return None
    class_name = next(
        (n for n in classes_of(code) if n.casefold() == found["class"].casefold()), None
    )
    course = " ".join((found["course"] or "").split())[:MAX_DETAIL]
    name = " ".join(found["name"].split())
    after_school = class_name in AFTER_SCHOOL
    if class_name is None or after_school != bool(course) or not _is_name(name):
        return None
    return Answer(SetDetails(class_name=class_name, country=name, course=course), code)


def _is_name(text: str) -> bool:
    """A country's name as the form writes it: letters, spaces and punctuation, nothing a prompt
    could carry an instruction in."""
    return (
        2 <= len(text) <= MAX_DETAIL
        and not any(c.isdigit() or c in NAME_REFUSED for c in text)
        and all(len(word) <= MAX_WORD for word in text.split())
    )


def learner_with(context: LearnerContext, answer: Answer) -> LearnerContext:
    """The learner as their answer makes them for the rest of the turn, as the app will keep them:
    the tutor reads their class, and what is written for it is no longer held back."""
    saved = answer.details
    system = of_country(answer.country_code)[0]
    level = next(
        (
            v
            for v in system.levels
            if v.name.en.casefold() == saved.class_name.casefold()
        ),
        None,
    )
    grade = (
        descriptor(system, level)
        if level
        else f"{saved.class_name} student, studying {saved.course}"
    )
    return context.model_copy(
        update={
            "country": saved.country,
            "country_code": answer.country_code,
            "grade_level": grade,
        }
    )


def owes_form(
    context: LearnerContext,
    cards: list[Card],
    actions: list[Action],
    earlier: list[Exchange],
) -> bool:
    """Whether a turn that ends with nothing for the learner to answer owes them the form: their
    class is not known, the turn showed no card and saved no class, and they were not just asked.
    Never left to the model, so a learner is not left with a reply and nothing to tap."""
    if not context.needs_class() or cards:
        return False
    if any(isinstance(a, SetDetails) and a.class_name for a in actions):
        return False
    asked = earlier[-1].get("card", "") if earlier else ""
    return not asked.startswith(FORM_DESCRIPTION)

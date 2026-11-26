"""The form that asks a new learner where they go to school: their country and class on one
card, and what the server does with the answer."""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from functools import cache

from ..education.catalogue import countries, country_name, of_country
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
from .details import AFTER_SCHOOL, DETAILS_KEPT, classes_of, clean_course, kept
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
# A learner is shown the form this many times while they leave it unanswered; after that the tutor
# asks in words, once.
MAX_FORMS = 2

# The message the form sends, in the words the server reads back, whatever the learner's language:
# "Country: Slovakia (SK). Class: Grade 7." and, after school, "... Class: Undergraduate. Course: Law."
# Only the code is read: the country's name is the catalogue's, never the text's.
ANSWER = re.compile(
    r"Country: .+? \((?P<code>[A-Z]{2})\)\. "
    r"Class: (?P<class>.+?)(?:\. Course: (?P<course>.+))?\."
)


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
    """Where the form starts, whatever the learner has not confirmed: the country the plan holds,
    else the one Cloudflare placed the connection in, else the device's guess, and none for a code
    the catalogue does not have. A country the learner confirmed comes with a class, and then the
    form is not asked at all."""
    return next(
        (
            code
            for code in (
                context.country_code,
                context.edge_country,
                context.device_country,
            )
            if code in countries()
        ),
        None,
    )


def form_for(context: LearnerContext) -> AboutYou:
    lists, list_of = _class_lists()
    return AboutYou(
        country=preselected(context),
        countries=sorted(list_of),
        names={code: country_name(code) for code in list_of},
        class_lists=lists,
        class_list_of=list_of,
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


def answer_in(message: str, context: LearnerContext) -> SetDetails | None:
    """The details the learner's message gives when it is the form's answer. The country is the
    catalogue's, found by its code, whatever name the text carries. A country outside the
    catalogue, a class the country does not have, and a level after school with no course (or a
    school class with one) are not an answer, and the message is left to the tutor."""
    found = ANSWER.fullmatch(message.strip())
    if found is None or kept(context):
        return None
    code = found["code"]
    if code not in countries():
        return None
    class_name = next(
        (n for n in classes_of(code) if n.casefold() == found["class"].casefold()), None
    )
    course = clean_course(found["course"] or "")
    if class_name is None or course is None:
        return None
    if (class_name in AFTER_SCHOOL) != bool(course):
        return None
    return SetDetails(
        class_name=class_name,
        country=country_name(code),
        course=course,
        country_code=code,
    )


def learner_with(context: LearnerContext, saved: SetDetails) -> LearnerContext:
    """The learner as their answer makes them for the rest of the turn, as the app will keep them:
    the tutor reads their class, and what is written for it is no longer held back."""
    system = of_country(saved.country_code)[0]
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
            "country_code": saved.country_code,
            "grade_level": grade,
        }
    )


def surviving(saved: list[Action]) -> list[Action]:
    """What of a learner's answer a turn ended by the safety check still keeps: their class and
    country, never what they wrote for a course. A level after school has no class without its
    course, so the form is asked again."""
    return [a for a in saved if not (isinstance(a, SetDetails) and a.course)]


def lacks_class(
    context: LearnerContext, cards: list[Card], actions: list[Action]
) -> bool:
    """Whether a turn ends with the learner's class unknown and nothing for them to answer."""
    if not context.needs_class() or cards:
        return False
    return not any(isinstance(a, SetDetails) and a.class_name for a in actions)


def form_due(earlier: list[Exchange]) -> bool:
    """Whether the form is owed after these earlier exchanges (not the turn's own run before it was
    retried). It is owed until the class is saved, but never twice in a row and no more than
    MAX_FORMS times in all, after which the tutor asks in words. Never left to the model, so a
    learner is not left with a reply and nothing to tap."""
    shown = [e.get("card", "").startswith(FORM_DESCRIPTION) for e in earlier]
    return not (shown and shown[-1]) and sum(shown) < MAX_FORMS

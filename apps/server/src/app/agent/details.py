"""The tutor's tools for what a learner says about where they go to school.
A class is chosen from the country's catalogue, as in onboarding, and the app
saves what the learner says as their details, the way its details page does:
the class then picks the plan's curriculum, and the tutor's stage."""

from __future__ import annotations

from collections.abc import Callable

from ..education.catalogue import of_country
from .choice import shown_card
from .choices import clean
from .context import LearnerContext
from .refusal import refusal
from .reply import Outcome, SetDetails

MAX_DETAIL = 60
MAX_QUESTION = 160
# After school the class is a level, and its course says what is studied.
AFTER_SCHOOL = ("Undergraduate", "Graduate")


DETAILS_KEPT = (
    "The learner's details are already kept, and what they say in a message never "
    "changes them. If they want them changed, tell them to open the You page and "
    "change their details there"
)


def kept(context: LearnerContext) -> bool:
    """A class and country are asked for only while the learner has neither a class nor
    a subject: the plan of a learner who has them is written for what they said before."""
    return bool(context.grade_level) or not context.empty_plan


def classes_of(country_code: str) -> list[str]:
    """The names of the classes the country's main school system has, then the
    levels after school. Never an age and never "not in school"."""
    system = of_country(country_code)[0]
    return [level.name.en for level in system.levels] + list(AFTER_SCHOOL)


def ask_class_tool(context: LearnerContext) -> Callable[..., dict | Outcome]:
    def ask_class(question: str) -> dict | Outcome:
        """Ask the learner which class they are in, as a card of their country's
        classes, and Undergraduate and Graduate, for them to tap. Use it when
        their class is not given and a school subject needs it. Never ask their
        age. Their tap arrives as their next message: save it with set_details.

        Args:
            question: One short question, e.g. "Which class are you in?".
        """
        if kept(context):
            return refusal(DETAILS_KEPT)
        asked = clean(question, MAX_QUESTION)
        if not asked:
            return refusal("The question is empty.")
        if not context.country_code:
            return refusal(
                "Their country is not known, so its classes are not either: ask "
                "which country they are in, in words, and save it with set_details"
            )
        return shown_card(asked, classes_of(context.country_code))

    return ask_class


def set_details_tool(context: LearnerContext) -> Callable[..., dict | Outcome]:
    def set_details(
        class_name: str = "", country: str = "", course: str = ""
    ) -> dict | Outcome:
        """Save the learner's class, country and course when they tell you them in
        this conversation, so lessons suit them. It only fills in what is not kept
        yet. Use it only for what the learner said about themselves, never for a
        guess or for someone else; leave out what they did not say. A class of
        Undergraduate or Graduate needs the course they study.

        Args:
            class_name: Their class as they named it, e.g. "JSS 2", "Grade 5" or "Undergraduate".
            country: Their country, in English, e.g. "Nigeria".
            course: What an undergraduate or graduate studies, e.g. "Accounting".
        """
        if kept(context):
            return refusal(DETAILS_KEPT)
        return _details(class_name, country, course)

    return set_details


def _details(class_name: str, country: str, course: str) -> dict | Outcome:
    saved = SetDetails(
        class_name=" ".join(class_name.split())[:MAX_DETAIL],
        country=" ".join(country.split())[:MAX_DETAIL],
        course=" ".join(course.split())[:MAX_DETAIL],
    )
    if not (saved.class_name or saved.country):
        return refusal("Say which class or country the learner told you.")
    after_school = saved.class_name.casefold() in {n.casefold() for n in AFTER_SCHOOL}
    if after_school and not saved.course:
        return refusal("Ask what they study, in words, and save it as the course.")
    return Outcome(
        told={
            "done": "The app is saving it. Thank them in a few words and carry on "
            "with what they came to learn."
        },
        actions=(saved,),
    )

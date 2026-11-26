"""The tutor's tool for saving what a learner says about where they go to school, and the
gate that holds back what is written for their class until it is known. A class is chosen from
the country's catalogue, as in onboarding, and the app saves it as its details page does: the
class then picks the plan's curriculum, and the tutor's stage."""

from __future__ import annotations

from collections.abc import Callable

from ..education.catalogue import code_named, country_name, of_country
from .context import LearnerContext
from .course import clean_course
from .refusal import refusal
from .reply import Action, Outcome, SetDetails

# After school the class is a level, and its course says what is studied.
AFTER_SCHOOL = ("Undergraduate", "Graduate")


DETAILS_KEPT = (
    "The learner's details are already kept, and what they say in a message never "
    "changes them. If they want them changed, tell them to open the You page and "
    "change their details there"
)


CLASS_FIRST = (
    "The learner's class is not known, and what you offer is written for it. Ask for "
    "it with ask_about_you, and only then {then}"
)


def class_first(
    context: LearnerContext, actions: list[Action], then: str
) -> dict | None:
    """The refusal for a subject or course offered to a learner whose class is not
    known, unless this turn already saves it."""
    if context.needs_class() and not saves_class(actions):
        return refusal(CLASS_FIRST.format(then=then))
    return None


def kept(context: LearnerContext) -> bool:
    """A class and country are asked for only while the learner has neither a class nor
    a subject: the plan of a learner who has them is written for what they said before."""
    return bool(context.grade_level) or not context.empty_plan


def classes_of(country_code: str) -> list[str]:
    """The names of the classes the country's main school system has, then the
    levels after school. Never an age and never "not in school"."""
    system = of_country(country_code)[0]
    return [level.name.en for level in system.levels] + list(AFTER_SCHOOL)


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


def class_named(country_code: str, name: str) -> str | None:
    """The name of the class the country's catalogue has for what the learner said (its name or an
    alias, in any case), or a level after school; None for anything else."""
    wanted = " ".join(name.split()).casefold()
    for after in AFTER_SCHOOL:
        if after.casefold() == wanted:
            return after
    for level in of_country(country_code)[0].levels:
        if wanted in {level.name.en.casefold(), *(a.casefold() for a in level.aliases)}:
            return level.name.en
    return None


def saves_class(actions: list[Action]) -> bool:
    """Whether the turn's actions save a class the app can keep: one with the country's code,
    which is what the app saves by."""
    return any(
        isinstance(a, SetDetails) and a.class_name and a.country_code for a in actions
    )


def _details(class_name: str, country: str, course: str) -> dict | Outcome:
    code = code_named(country)
    if not (class_name.strip() or country.strip()):
        return refusal("Say which class or country the learner told you.")
    if code is None:
        return refusal(
            "That country is not one the app has. Ask the learner which country they are in, "
            "in words, and save it with their class"
        )
    named = class_named(code, class_name) if class_name.strip() else ""
    if named is None:
        return refusal(
            f"That is not a class of {country_name(code)}: ask the learner which class "
            "they are in, in words"
        )
    studies = clean_course(course)
    if named in AFTER_SCHOOL and not studies:
        return refusal("Ask what they study, in words, and save it as the course.")
    saved = SetDetails(
        class_name=named,
        country=country_name(code),
        course=studies if named in AFTER_SCHOOL else "",
        country_code=code,
    )
    return Outcome(
        told={
            "done": "The app is saving it. Thank them in a few words and carry on "
            "with what they came to learn."
        },
        actions=(saved,),
    )

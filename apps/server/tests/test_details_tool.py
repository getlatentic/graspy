"""What a learner says of their school: the class card from the country's
catalogue, and the details the app is told to save."""

import dspy

from app.agent.context import LearnerContext
from app.agent.reply import SetDetails
from app.agent.toolkit import Turn, TurnOutputs, tools_for
from app.education.catalogue import of_country

NIGERIA = LearnerContext(country="Nigeria", countryCode="NG")


def run(name: str, context: LearnerContext = NIGERIA, **arguments):
    outputs = TurnOutputs()
    tool = next(
        tool for tool in tools_for(Turn(context, ""), outputs) if tool.__name__ == name
    )
    return dspy.Tool(tool)(**arguments), outputs


def options_of(outputs: TurnOutputs) -> list[str]:
    [card] = outputs.cards
    return card.tool_result.structured_content.options


def test_the_class_card_lists_the_countrys_classes_then_the_levels_after_school():
    _, outputs = run("ask_class", question="Which class are you in?")

    options = options_of(outputs)
    assert options[:-2] == [level.name.en for level in of_country("NG")[0].levels]
    assert options[-2:] == ["Undergraduate", "Graduate"]
    assert "JSS 1" in options


def test_the_class_card_never_asks_the_age_or_offers_not_in_school():
    _, outputs = run("ask_class", question="Which class are you in?")

    text = " ".join(options_of(outputs)).casefold()
    assert "age" not in text
    assert "not in school" not in text


def test_a_country_the_catalogue_does_not_cover_gets_numbered_grades():
    _, outputs = run(
        "ask_class",
        LearnerContext(countryCode="AQ"),
        question="Which class are you in?",
    )

    options = options_of(outputs)
    assert options[0] == "Grade 1"
    assert "Grade 12" in options


def test_without_a_country_the_class_card_is_refused_and_asks_for_it_in_words():
    told, outputs = run("ask_class", LearnerContext(), question="Which class?")

    assert "Nothing was done." in told["error"]
    assert "set_details" in told["error"]
    assert outputs.cards == []


def test_what_the_learner_said_becomes_an_action_for_the_app():
    _, outputs = run("set_details", class_name=" JSS  2 ", country="Nigeria")

    assert outputs.actions == [
        SetDetails(class_name="JSS 2", country="Nigeria", course="")
    ]


def test_a_level_after_school_needs_its_course():
    told, outputs = run("set_details", class_name="Undergraduate")

    assert "Nothing was done." in told["error"]
    assert outputs.actions == []

    _, outputs = run("set_details", class_name="undergraduate", course="Accounting")
    assert outputs.actions[0].course == "Accounting"


def test_nothing_said_saves_nothing():
    told, outputs = run("set_details")

    assert "Nothing was done." in told["error"]
    assert outputs.actions == []


def test_a_plan_with_no_subjects_can_be_given_its_first():
    told, outputs = run(
        "change_subjects", LearnerContext(planId="plan-1"), add=["Mathematics"]
    )

    assert "error" not in told
    assert outputs.actions[0].add == ["Mathematics"]


def test_a_plan_with_no_subjects_tells_the_tutor_to_ask_what_to_learn():
    context = LearnerContext.from_metadata(
        {"learner": {"planId": "plan-1", "country": "Nigeria", "countryCode": "NG"}}
    )

    assert "no subjects yet" in context.describe_studying()
    assert context.country_code == "NG"
    assert "no subjects yet" not in LearnerContext().describe_studying()

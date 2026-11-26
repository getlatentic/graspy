"""What a learner says of their school: the class card from the country's
catalogue, and the details the app is told to save."""

import dspy

from app.agent.context import LearnerContext, SubjectRef
from app.agent.details import classes_of
from app.agent.reply import SetDetails
from app.agent.toolkit import Turn, TurnOutputs, tools_for

NIGERIA = LearnerContext(country="Nigeria", countryCode="NG", emptyPlan=True)


def run(name: str, context: LearnerContext = NIGERIA, **arguments):
    outputs = TurnOutputs()
    tool = next(
        tool for tool in tools_for(Turn(context, ""), outputs) if tool.__name__ == name
    )
    return dspy.Tool(tool)(**arguments), outputs


def test_what_the_learner_said_becomes_an_action_for_the_app():
    _, outputs = run("set_details", class_name=" JSS  2 ", country="Nigeria")

    assert outputs.actions == [
        SetDetails(class_name="JSS 2", country="Nigeria", course="", country_code="NG")
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


STARTING = LearnerContext(planId="plan-1", emptyPlan=True, gradeLevel="JSS 1")


def test_a_plan_with_no_subjects_can_be_given_its_first_once_the_class_is_known():
    told, outputs = run("change_subjects", STARTING, add=["Mathematics"])

    assert "error" not in told
    assert outputs.actions[0].add == ["Mathematics"]


def test_the_first_subject_waits_for_the_class_which_the_tutor_is_told_to_ask():
    told, outputs = run(
        "change_subjects",
        LearnerContext(planId="plan-1", emptyPlan=True),
        add=["Mathematics"],
    )

    assert "ask_about_you" in told["error"]
    assert "Nothing was done." in told["error"]
    assert outputs.actions == []


def test_a_plan_is_not_taken_for_empty_because_no_subjects_were_sent():
    told, _ = run(
        "change_subjects",
        LearnerContext(planId="plan-1", gradeLevel="JSS 1"),
        add=["Mathematics"],
    )

    assert "not sent" in told["error"]


KEPT = LearnerContext(
    country="Nigeria", countryCode="NG", gradeLevel="JSS 2", emptyPlan=True
)
WITH_SUBJECTS = LearnerContext(
    country="Nigeria",
    countryCode="NG",
    subjects=[SubjectRef(name="Mathematics", slug="mathematics")],
)


def test_a_class_already_kept_is_never_changed_by_what_the_learner_says():
    told, outputs = run("set_details", KEPT, class_name="Grade 5", country="Ghana")

    assert "You page" in told["error"]
    assert "Nothing was done." in told["error"]
    assert outputs.actions == []


def test_a_country_alone_cannot_wipe_a_kept_class():
    told, outputs = run("set_details", KEPT, country="Ghana")

    assert "error" in told
    assert outputs.actions == []


def test_a_class_already_kept_is_not_asked_for_again():
    told, outputs = run("ask_about_you", KEPT)

    assert "You page" in told["error"]
    assert outputs.cards == []


def test_a_country_not_yet_confirmed_can_be_corrected_while_there_is_no_class():
    _, outputs = run(
        "set_details",
        NIGERIA,
        country="Ghana",
    )

    assert outputs.actions[0].country == "Ghana"


def test_a_plan_with_no_subjects_tells_the_tutor_to_ask_what_to_learn():
    context = LearnerContext.from_metadata(
        {"learner": {"planId": "plan-1", "emptyPlan": True, "countryCode": "NG"}}
    )

    assert "no subjects yet" in context.describe_studying()
    assert context.country_code == "NG"
    assert "no subjects yet" not in LearnerContext().describe_studying()
    sent = LearnerContext(planId="plan-1")
    assert "no subjects yet" not in sent.describe_studying()


def test_a_country_code_that_is_none_drops_only_itself():
    context = LearnerContext.from_metadata(
        {"learner": {"country": "Nigeria", "countryCode": "NGA", "gradeLevel": "JSS 1"}}
    )

    assert context.country_code is None
    assert (context.country, context.grade_level) == ("Nigeria", "JSS 1")


def test_a_country_code_is_read_in_capitals():
    context = LearnerContext.from_metadata({"learner": {"countryCode": " ng "}})

    assert context.country_code == "NG"


def test_an_unknown_country_still_gets_numbered_grades():
    assert classes_of("ZZ")[0] == "Grade 1"


def test_a_learner_with_subjects_and_no_class_is_refused_like_one_with_a_class():
    told, outputs = run("set_details", WITH_SUBJECTS, class_name="Grade 5")
    asked, cards = run("ask_about_you", WITH_SUBJECTS)

    assert "You page" in told["error"]
    assert "You page" in asked["error"]
    assert outputs.actions == []
    assert cards.cards == []

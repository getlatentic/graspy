"""The tutor's tools, which report failure as an ``error`` the model can act on."""

import asyncio
import inspect

import pytest

from app.agent import tools
from app.agent.context import LearnerContext
from app.agent.toolkit import TOOLS, Turn, TurnOutputs, tools_for

ASKED_FOR_THE_LESSON = "Take me to fractions."


@pytest.fixture(autouse=True)
def judged(monkeypatch):
    """The judge of whether a message asks for a lesson is a model call; here
    it reads only the message this file sends to ask for one."""

    async def asks_for_lesson(message: str) -> bool:
        return message == ASKED_FOR_THE_LESSON

    monkeypatch.setattr(tools, "asks_for_lesson", asks_for_lesson)


def use(
    name: str, context: LearnerContext, *args, message=ASKED_FOR_THE_LESSON, **kwargs
):
    """Call a tool as the model does in a turn: what it reads, and what the
    turn gathered for the app."""
    outputs = TurnOutputs()
    built = tools_for(Turn(context, message), outputs)
    tool = next(tool for tool in built if tool.__name__ == name)
    result = tool(*args, **kwargs)
    return (asyncio.run(result) if inspect.iscoroutine(result) else result), outputs


def wire(outputs: TurnOutputs) -> list[dict]:
    return [action.model_dump(by_alias=True) for action in outputs.actions]


TOPICS = [
    "Number Systems",
    "Addition and Subtraction",
    "Fractions and Decimals",
    "Times Tables",
]


def maths() -> LearnerContext:
    return LearnerContext(
        subject="Mathematics", subjectSlug="mathematics", topics=TOPICS
    )


def test_calculate_returns_a_result():
    assert tools.calculate("2 + 2") == {"result": "4"}


@pytest.mark.parametrize(
    "expression",
    [
        "(lambda: __import__('os').popen('id').read())()",
        "().__class__.__bases__[0].__subclasses__()",
        "9**9**9",
        "not-an-expression",
    ],
    ids=["lambda-escape", "subclasses", "denial-of-service", "syntax"],
)
def test_calculate_refuses_anything_unsafe_without_raising(expression):
    result = tools.calculate(expression)

    assert "error" in result
    assert "result" not in result


def test_calculate_explains_the_refusal_so_the_model_can_correct_itself(caplog):
    with caplog.at_level("DEBUG", logger="app.agent.tools"):
        result = tools.calculate("'abc'")

    assert result == {"error": "only numbers are allowed"}
    assert "calculate rejected \"'abc'\": only numbers are allowed" in caplog.messages


@pytest.mark.parametrize(
    ("wanted", "expected"),
    [
        ("Fractions and Decimals", 2),
        ("fractions", 2),
        ("times tables", 3),
        ("Adition and subtraction", 1),
        ("number system", 0),
    ],
    ids=["exact", "part-of-title", "case", "typo", "singular"],
)
def test_a_topic_is_found_the_way_a_learner_names_it(wanted, expected):
    assert tools.find_topic(wanted, TOPICS) == expected


@pytest.mark.parametrize("wanted", ["Photosynthesis", "", "a", "Ratio and Proportion"])
def test_a_topic_not_in_the_subject_is_not_guessed(wanted):
    """Opening the nearest topic for "photosynthesis" would send a learner
    somewhere they did not ask to go."""
    assert tools.find_topic(wanted, TOPICS) is None


def test_opening_a_topic_records_an_action_for_the_app():
    result, outputs = use("open_topic", maths(), "fractions")

    assert result == {
        "topic": "Fractions and Decimals",
        "position": 3,
        "done": "The app shows the learner a button below to open the lesson; tell them it is there.",
    }
    assert wire(outputs) == [
        {
            "type": "open_topic",
            "subjectSlug": "mathematics",
            "topicIndex": 2,
            "topic": "Fractions and Decimals",
        }
    ]


def test_a_learner_who_asked_to_be_taught_is_taught_not_offered_the_lesson():
    result, outputs = use(
        "open_topic", maths(), "fractions", message="Teach me fractions."
    )

    assert "teach it here" in result["error"]
    assert wire(outputs) == []


def test_an_unknown_topic_lists_the_real_ones_so_the_model_can_ask():
    result, outputs = use("open_topic", maths(), "photosynthesis")

    assert result["topics"] == TOPICS
    assert "error" in result
    assert wire(outputs) == []


def test_without_an_open_subject_nothing_can_be_opened():
    result, outputs = use("open_topic", LearnerContext(), "fractions")

    assert "error" in result
    assert wire(outputs) == []


def test_the_tool_is_named_and_described_for_the_model():
    """ReAct shows the model a tool's name and docstring; each must read as
    what it does, whatever closure or wrapper made it."""
    built = {
        tool.__name__: tool
        for tool in tools_for(Turn(maths(), ASKED_FOR_THE_LESSON), TurnOutputs())
    }

    assert list(built) == [spec.name for spec in TOOLS]
    assert all(tool.__doc__ for tool in built.values())
    assert "Offer a topic" in built["open_topic"].__doc__


def learner_with_subjects() -> LearnerContext:
    return LearnerContext(
        subject="Mathematics",
        subjectSlug="mathematics",
        topics=TOPICS,
        subjects=[
            {"name": "Mathematics", "slug": "mathematics"},
            {"name": "Basic Science", "slug": "basic-science"},
        ],
    )


def test_a_new_topic_is_added_to_the_open_subject_by_default():
    result, outputs = use("add_topic", learner_with_subjects(), "Ratio and Proportion")

    assert result == {
        "added": "Ratio and Proportion",
        "subject": "Mathematics",
        "done": "The app is adding Ratio and Proportion to their plan. "
        "The app shows the learner a button below to open the lesson; tell them it is there."
        " Do not open it yourself.",
    }
    assert wire(outputs) == [
        {
            "type": "add_topic",
            "subjectSlug": "mathematics",
            "subject": "Mathematics",
            "topic": "Ratio and Proportion",
        }
    ]


def test_a_new_topic_goes_to_the_subject_it_belongs_to():
    _, outputs = use(
        "add_topic", learner_with_subjects(), "Photosynthesis", subject="science"
    )

    assert wire(outputs)[0]["subjectSlug"] == "basic-science"


def test_a_topic_already_in_the_list_is_taught_not_added_twice_or_offered():
    result, outputs = use("add_topic", learner_with_subjects(), "fractions")

    assert result["topic"] == "Fractions and Decimals"
    assert "Teach it here" in result["note"]
    assert wire(outputs) == []


@pytest.mark.parametrize("subject", ["History", ""])
def test_a_topic_with_nowhere_to_go_is_refused_with_the_subjects_listed(subject):
    context = LearnerContext(subjects=[{"name": "Mathematics", "slug": "mathematics"}])

    result, outputs = use("add_topic", context, "Photosynthesis", subject=subject)

    assert result["subjects"] == ["Mathematics"]
    assert wire(outputs) == []


def test_a_new_topic_title_is_trimmed_and_capped():
    _, outputs = use("add_topic", learner_with_subjects(), "  Long   " + "x" * 200)

    assert wire(outputs)[0]["topic"] == ("Long " + "x" * 200)[: tools.MAX_TOPIC_TITLE]


def test_subjects_are_added_and_dropped_by_the_names_the_learner_has():
    result, outputs = use(
        "change_subjects", learner_with_subjects(), add=["Physics"], remove=["science"]
    )

    assert "adding Physics" in result["done"]
    assert "confirm removing Basic Science" in result["done"]
    assert wire(outputs) == [
        {"type": "change_subjects", "add": ["Physics"], "remove": ["Basic Science"]}
    ]


def test_adding_only_needs_no_confirmation_and_skips_subjects_already_there():
    result, outputs = use(
        "change_subjects", learner_with_subjects(), add=["Physics", "mathematics"]
    )

    assert "confirm" not in result["done"]
    assert "cannot be opened in this turn" in result["done"]
    assert wire(outputs)[0]["add"] == ["Physics"]


@pytest.mark.parametrize(
    ("add", "remove"),
    [
        ([], ["History"]),
        (["Mathematics"], []),
        ([], ["Mathematics", "Basic Science"]),
        ([f"Subject {i}" for i in range(14)], []),
    ],
    ids=["unknown-subject", "nothing-new", "empties-the-plan", "over-the-limit"],
)
def test_a_change_the_plan_cannot_take_is_refused(add, remove):
    result, outputs = use(
        "change_subjects", learner_with_subjects(), add=add, remove=remove
    )

    assert "error" in result
    assert wire(outputs) == []


def test_rebuilding_asks_the_app_to_confirm():
    result, outputs = use("rebuild_plan", learner_with_subjects())

    assert result == {"needs_confirmation": True}
    assert wire(outputs) == [{"type": "rebuild_plan"}]


def test_nothing_is_rebuilt_without_the_learners_subjects():
    result, outputs = use("rebuild_plan", LearnerContext())

    assert "error" in result
    assert wire(outputs) == []


def test_switching_to_a_subject_opens_it_and_changes_nothing():
    result, outputs = use("open_subject", learner_with_subjects(), "science")

    assert result == {
        "subject": "Basic Science",
        "done": "The app shows the learner a button below to open the subject; tell them it is there.",
    }
    assert wire(outputs) == [
        {
            "type": "open_subject",
            "subjectSlug": "basic-science",
            "subject": "Basic Science",
        }
    ]


@pytest.mark.parametrize("subject", ["Real analysis", " "])
def test_a_subject_the_learner_lacks_is_not_opened_and_points_to_a_path(subject):
    result, outputs = use("open_subject", learner_with_subjects(), subject)

    assert "propose_path" in result["error"]
    assert result["subjects"] == ["Mathematics", "Basic Science"]
    assert wire(outputs) == []


def test_a_topic_for_a_subject_the_learner_lacks_points_to_a_path():
    """Not "Real Analysis" added to a Mathematics the learner does not have,
    and reported to them as added."""
    context = LearnerContext(
        subject="English",
        subjectSlug="english",
        subjects=[{"name": "English", "slug": "english"}],
    )

    result, outputs = use("add_topic", context, "Real Analysis", subject="Mathematics")

    assert "propose_path" in result["error"]
    assert wire(outputs) == []


def test_a_path_is_proposed_for_the_app_to_plan_and_show():
    result, outputs = use("propose_path", maths(), "  real   analysis ")

    assert "real analysis" in result["shown"]
    assert "do not offer to show it" in result["shown"]
    assert wire(outputs) == [{"type": "propose_path", "goal": "real analysis"}]


def test_a_path_needs_a_goal():
    result, outputs = use("propose_path", maths(), "   ")

    assert "error" in result
    assert wire(outputs) == []


def test_a_tool_with_ui_declares_the_resource_its_cards_name():
    """As an MCP Apps tool names its UI in _meta.ui.resourceUri: the app finds
    a card's renderer by the resource, so tool and card must agree."""
    from typing import get_args

    from app.agent.cards import Card

    cards = get_args(get_args(Card)[0])
    declared = {spec.name: spec.ui for spec in TOOLS if spec.ui}
    assert declared == {
        card.model_fields["tool_name"].default: card.model_fields[
            "resource_uri"
        ].default
        for card in cards
    }

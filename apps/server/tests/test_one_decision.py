"""One decision at a time: a question the learner taps an answer to is alone in
its reply, and what is offered before the class is known waits for it."""

import dspy
import pytest
from stand_in import stand_in
from test_tutor import CARD_ANSWERS, finish

from app.agent.answer_gate import AnswerGate
from app.agent.cards import ChoiceCard, DetailsCard, PracticeCard
from app.agent.context import LearnerContext, SubjectRef
from app.agent.decision import WAITING, WITHDRAWN
from app.agent.memory import InMemoryConversationStore
from app.agent.reply import ProposePath, SetDetails
from app.agent.toolkit import Turn, TurnOutputs, tools_for
from app.agent.tutor import Tutor, TutorReply

# A learner with a plan, so a class is not asked for and a course can be offered.
PLANNED = LearnerContext(
    gradeLevel="JSS 1",
    subjects=[SubjectRef(name="Mathematics", slug="mathematics")],
)
# The start of /try: nothing yet, not even a class.
NEW = LearnerContext(country="Nigeria", countryCode="NG", emptyPlan=True)
WHICH = {"question": "Which do you mean?", "options": ["Python", "Rust"]}
PRACTICE = CARD_ANSWERS[0]["next_tool_args"]


class Built:
    def __init__(self, context: LearnerContext) -> None:
        self.outputs = TurnOutputs()
        self.tools = {
            t.__name__: dspy.Tool(t)
            for t in tools_for(Turn(context, "x"), self.outputs)
        }

    def __call__(self, name: str, **arguments) -> dict:
        return self.tools[name](**arguments)

    def card_types(self) -> list[type]:
        return [type(card) for card in self.outputs.cards]


def test_a_course_offered_after_a_question_is_refused_and_the_model_is_told():
    built = Built(PLANNED)

    built("give_choice", **WHICH)
    told = built("propose_path", goals=["Machine learning"])

    assert WAITING in told["error"]
    assert built.card_types() == [ChoiceCard]
    assert built.outputs.actions == []


def test_a_course_offered_before_a_question_is_withdrawn_and_the_model_is_told():
    built = Built(PLANNED)

    built("propose_path", goals=["Machine learning"])
    told = built("give_choice", **WHICH)

    assert told["withdrawn"] == WITHDRAWN
    assert built.card_types() == [ChoiceCard]
    assert built.outputs.actions == []


def test_a_question_with_no_offer_before_it_is_told_nothing_withdrawn():
    built = Built(PLANNED)

    told = built("give_choice", **WHICH)

    assert "withdrawn" not in told


def test_a_button_to_open_a_subject_is_an_offer_too():
    built = Built(PLANNED)

    built("open_subject", subject="Mathematics")
    built("give_choice", **WHICH)

    assert built.outputs.actions == []
    assert built.card_types() == [ChoiceCard]


def test_questions_to_practise_after_a_question_are_refused():
    built = Built(PLANNED)

    built("give_choice", **WHICH)
    told = built("give_practice", **PRACTICE)

    assert WAITING in told["error"]
    assert built.card_types() == [ChoiceCard]


def test_questions_to_practise_before_a_question_are_withdrawn():
    built = Built(PLANNED)

    built("give_practice", **PRACTICE)
    told = built("give_choice", **WHICH)

    assert told["withdrawn"] == WITHDRAWN
    assert built.card_types() == [ChoiceCard]


@pytest.mark.parametrize("first", ["practice", "choice"])
def test_the_answers_of_questions_that_are_not_shown_are_still_not_said(first):
    built = Built(PLANNED)
    calls = {
        "practice": lambda: built("give_practice", **PRACTICE),
        "choice": lambda: built("give_choice", **WHICH),
    }

    for name in (first, "choice" if first == "practice" else "practice"):
        calls[name]()
    gate = AnswerGate(built.outputs, ())

    sent = gate.feed("Think about it. The answer is 0.375. ") + gate.finish()

    assert not any(isinstance(c, PracticeCard) for c in built.outputs.cards)
    assert "0.375" not in sent


def test_a_second_question_joins_the_first_as_two_cards_always_have():
    built = Built(PLANNED)

    built("give_choice", **WHICH)
    built("give_choice", question="Which one?", options=["A", "B"])

    assert built.card_types() == [ChoiceCard, ChoiceCard]


def test_a_course_is_not_offered_before_the_class_is_known():
    built = Built(NEW)

    told = built("propose_path", goals=["Machine learning"])

    assert "ask_about_you" in told["error"]
    assert "propose the course" in told["error"]
    assert built.outputs.actions == []


def test_a_subject_is_not_added_before_the_class_is_known():
    built = Built(NEW)

    told = built("change_subjects", add=["Physics"])

    assert "ask_about_you" in told["error"]
    assert built.outputs.actions == []


def test_a_course_is_offered_in_the_message_that_saves_the_class():
    built = Built(NEW)

    built("set_details", class_name="Secondary Year 2", country="Nigeria")
    told = built("propose_path", goals=["Machine learning"])

    assert "error" not in told
    assert built.outputs.actions == [
        SetDetails(class_name="Secondary Year 2", country="Nigeria", course=""),
        ProposePath(goal="Machine learning"),
    ]


def test_saving_only_the_country_does_not_open_the_way_to_a_course():
    built = Built(NEW)

    built("set_details", country="Nigeria")
    told = built("propose_path", goals=["Machine learning"])

    assert "ask_about_you" in told["error"]


def test_saving_the_class_and_adding_the_subject_are_one_message():
    built = Built(NEW)

    built("set_details", class_name="JSS 1", country="Nigeria")
    told = built("change_subjects", add=["Physics"])

    assert "error" not in told
    assert [a.type for a in built.outputs.actions] == [
        "set_details",
        "change_subjects",
    ]


def step(tool: str, **arguments) -> dict:
    return {"next_thought": tool, "next_tool_name": tool, "next_tool_args": arguments}


DONE = finish("")[0]


def say(answer: str) -> dict:
    return finish(answer)[1]


async def reply_to(context: LearnerContext, script: list[dict]) -> TutorReply:
    _, model = stand_in(script)
    with model:
        items = [
            item
            async for item in Tutor(InMemoryConversationStore()).stream(
                "c", "Machine learning for students", context
            )
        ]
    assert isinstance(items[-1], TutorReply)
    return items[-1]


async def test_a_new_learner_naming_a_goal_is_asked_the_class_and_nothing_else():
    """The staging turn that showed the class card, a course and "ready" at once."""
    reply = await reply_to(
        NEW,
        [
            step("propose_path", goals=["Machine learning"]),
            step("ask_about_you"),
            DONE,
            say("Good choice. One thing first."),
        ],
    )

    assert [type(card) for card in reply.cards] == [DetailsCard]
    assert reply.actions == []


async def test_the_choice_wins_whichever_order_the_model_calls_in():
    reply = await reply_to(
        PLANNED,
        [
            step("give_choice", **WHICH),
            step("propose_path", goals=["Machine learning"]),
            DONE,
            say("Which do you mean?"),
        ],
    )

    assert [type(card) for card in reply.cards] == [ChoiceCard]
    assert reply.actions == []


async def test_the_tap_on_the_class_saves_it_and_offers_the_course_in_one_reply():
    reply = await reply_to(
        NEW,
        [
            step("set_details", class_name="Secondary Year 2", country="Nigeria"),
            step("propose_path", goals=["Machine learning"]),
            DONE,
            say("Thanks. Here is the path to machine learning."),
        ],
    )

    assert [a.type for a in reply.actions] == ["set_details", "propose_path"]
    assert reply.cards == []

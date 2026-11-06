"""What the model reads of a tool's result: its words, never the card's data; and what it is told when a tool refuses."""

import re
from pathlib import Path
from typing import get_args

import dspy
import pytest
from stand_in import stand_in
from test_passage_tool import PASSAGE, asked
from test_practice_tool import written

from app.agent.cards import Card
from app.agent.context import LearnerContext, SubjectRef
from app.agent.labels import DATA_ONLY
from app.agent.lesson_request import AsksForLesson
from app.agent.memory import InMemoryConversationStore
from app.agent.refusal import NOTHING_DONE
from app.agent.summary import SummariseConversation
from app.agent.toolkit import TOOLS, Turn, TurnOutputs, tools_for
from app.agent.tutor import Tutor, TutorReply, TutorTurn

# What only the server adds to a card: the keys of its tool result and its view's key.
CARD_KEYS = (
    "structuredContent",
    "structured_content",
    "_meta",
    "viewUUID",
    "view_uuid",
    "ui://",
    "resourceUri",
    "resource_uri",
    "toolResult",
    "tool_result",
    "toolInput",
    "tool_input",
)
BY_HAND = re.compile(r"""[\"']error[\"']\s*:|\berror\s*=""")
HEX_KEY = re.compile(r"\b[0-9a-f]{32}\b")


def call(tool: str, **arguments) -> list[dict]:
    return [
        {
            "next_thought": f"use {tool}",
            "next_tool_name": tool,
            "next_tool_args": arguments,
        }
    ]


def card_kinds() -> set[str]:
    return {
        get_args(card.model_fields["resource_uri"].annotation)[0]
        for card in get_args(get_args(Card)[0])
    }


# One scripted call for each kind of card; a turn keeps only the last card, so each is a turn.
CARD_CALLS = {
    "ui://graspy/practice": (
        "give_practice",
        {"instruction": "Convert.", "questions": [written()]},
    ),
    "ui://graspy/passage": (
        "give_passage",
        {
            "instruction": "Read.",
            "title": "Market Day",
            "passage": PASSAGE,
            "questions": [asked()],
        },
    ),
}


def test_every_kind_of_card_has_a_scripted_call():
    assert set(CARD_CALLS) == card_kinds()


@pytest.mark.parametrize("kind", CARD_CALLS)
async def test_the_model_reads_none_of_the_data_of_a_card(kind):
    tool, arguments = CARD_CALLS[kind]
    script = [
        *call(tool, **arguments),
        {"next_thought": "done", "next_tool_name": "finish", "next_tool_args": {}},
        {"reasoning": "r", "answer": "Here you go.", "follow_ups": []},
    ]
    lm, context = stand_in(script)

    with context:
        items = [
            item
            async for item in Tutor(InMemoryConversationStore()).stream(
                "c1", "Give me something to try"
            )
        ]

    reply = items[-1]
    assert isinstance(reply, TutorReply)
    assert [card.resource_uri for card in reply.cards] == [kind]
    read = "\n".join(
        str(message["content"]) for entry in lm.history for message in entry["messages"]
    )
    assert [key for key in CARD_KEYS if key in read] == []
    assert HEX_KEY.findall(read) == []
    assert "as a card below your answer" in read


@pytest.mark.parametrize("kind", CARD_CALLS)
async def test_a_tool_that_makes_a_card_returns_the_model_only_a_done_sentence(kind):
    name, arguments = CARD_CALLS[kind]
    outputs = TurnOutputs()
    tool = next(
        t for t in tools_for(Turn(LearnerContext(), ""), outputs) if t.__name__ == name
    )

    told = await dspy.Tool(tool).acall(**arguments)

    assert list(told) == ["done"]
    assert len(outputs.cards) == 1


PLAN = LearnerContext(
    subject="Mathematics",
    subjectSlug="mathematics",
    topics=["Number Systems"],
    subjects=[SubjectRef(name="Mathematics", slug="mathematics")],
)
NOTHING_SENT = LearnerContext()
MANY = LearnerContext(
    subjects=[SubjectRef(name=f"Subject {n}", slug=f"s{n}") for n in range(15)]
)

# (tool, the model's arguments, what the app sent, whether the learner asked for the lesson)
REFUSALS = [
    ("calculate", {"expression": "'abc'"}, PLAN, True),
    ("open_subject", {"subject": "Astrology"}, PLAN, True),
    ("open_topic", {"topic": "Algebra"}, PLAN, True),
    ("open_topic", {"topic": "Number Systems"}, NOTHING_SENT, True),
    ("open_topic", {"topic": "Number Systems"}, PLAN, False),
    ("add_topic", {"topic": " "}, PLAN, True),
    ("add_topic", {"topic": "Physics", "subject": "Astrology"}, PLAN, True),
    ("propose_path", {"goal": " "}, PLAN, True),
    ("change_subjects", {"remove": ["Astrology"]}, PLAN, True),
    ("change_subjects", {"add": ["Physics"]}, NOTHING_SENT, True),
    ("change_subjects", {"add": ["Mathematics"]}, PLAN, True),
    ("change_subjects", {"remove": ["Mathematics"]}, PLAN, True),
    ("change_subjects", {"add": ["Physics"]}, MANY, True),
    ("rebuild_plan", {}, NOTHING_SENT, True),
    ("give_practice", {"instruction": "x", "questions": []}, PLAN, True),
    (
        "give_practice",
        {"instruction": "x", "questions": [written(answer_index=7)]},
        PLAN,
        True,
    ),
    (
        "give_passage",
        {"instruction": "x", "title": "t", "passage": "short", "questions": [asked()]},
        PLAN,
        True,
    ),
    (
        "give_passage",
        {
            "instruction": "x",
            "title": "Market",
            "passage": PASSAGE,
            "questions": [asked(answer_index=9)],
        },
        PLAN,
        True,
    ),
]


@pytest.mark.parametrize(("name", "arguments", "sent", "lesson"), REFUSALS)
async def test_a_refused_call_says_nothing_was_done(
    monkeypatch, name, arguments, sent, lesson
):
    async def asked_for_lesson(message: str) -> bool:
        return lesson

    monkeypatch.setattr("app.agent.tools.asks_for_lesson", asked_for_lesson)
    tool = next(
        t
        for t in tools_for(Turn(sent, "take me to the lesson"), TurnOutputs())
        if t.__name__ == name
    )

    result = await dspy.Tool(tool).acall(**arguments)

    assert result["error"].endswith(NOTHING_DONE)


async def test_a_refusal_that_returns_the_learners_lists_labels_them_as_data():
    tool = next(
        t
        for t in tools_for(Turn(PLAN, "take me to the lesson"), TurnOutputs())
        if t.__name__ == "open_topic"
    )

    result = await dspy.Tool(tool).acall(topic="Algebra")

    assert result["topics"] == ["Number Systems"]
    assert result["data_note"] == DATA_ONLY


def test_every_tool_has_a_refusal_case():
    assert {case[0] for case in REFUSALS} == {spec.name for spec in TOOLS}


def test_what_the_learner_or_the_app_wrote_is_labelled_as_data():
    fields = TutorTurn.input_fields

    for name in ("learner", "studying", "record", "conversation", "app"):
        assert DATA_ONLY in fields[name].json_schema_extra["desc"], name
    assert DATA_ONLY not in fields["message"].json_schema_extra["desc"]


@pytest.mark.parametrize(
    ("signature", "names"),
    [
        (SummariseConversation, ("summary", "exchanges")),
        (AsksForLesson, ("message",)),
    ],
)
def test_the_other_models_that_read_the_learners_words_are_told_they_are_data(
    signature, names
):
    for name in names:
        assert DATA_ONLY in signature.input_fields[name].json_schema_extra["desc"]


def test_no_tool_builds_a_refusal_by_hand():
    """A refusal made outside `refusal` could leave out the sentence."""
    agent = Path(__file__).parents[1] / "src" / "app" / "agent"
    by_hand = [
        path.name
        for path in agent.glob("*.py")
        if path.name != "refusal.py" and BY_HAND.search(path.read_text())
    ]

    assert by_hand == []

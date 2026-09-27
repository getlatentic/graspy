"""The tutor's ReAct loop, driven by DummyLM: each step, then the answer."""

from pathlib import Path

import pytest
from dspy.utils.exceptions import AdapterParseError
from stand_in import inputs, stand_in

from app.agent.app_tools import app_calls
from app.agent.context import (
    GENERAL_CONVERSATION,
    WHOLE_SUBJECT_CONVERSATION,
    LearnerContext,
)
from app.agent.memory import Exchange, InMemoryConversationStore
from app.agent.streaming import ToolActivity
from app.agent.transcript import render
from app.agent.tutor import (
    NO_APP_CALLS,
    Tutor,
    TutorReply,
    TutorTurn,
    clean_follow_ups,
    signature_for,
)
from app.agent.unanswered import NO_ANSWER


async def finished(tutor: Tutor, *args) -> TutorReply:
    """The finished reply at the end of a turn's stream."""
    items = [item async for item in tutor.stream(*args)]
    assert isinstance(items[-1], TutorReply)
    return items[-1]


def finish(answer: str, follow_ups: list[str] | None = None) -> list[dict]:
    """A turn that needs no tool: the step finishes, then the answer."""
    return [
        {
            "next_thought": "I can answer directly",
            "next_tool_name": "finish",
            "next_tool_args": {},
        },
        {"reasoning": "r", "answer": answer, "follow_ups": follow_ups or []},
    ]


MATHS = LearnerContext(
    country="Nigeria",
    language="Yoruba",
    gradeLevel="JSS 1",
    subject="Mathematics",
    subjectSlug="mathematics",
    topic="Number Systems",
    topics=["Number Systems", "Fractions and Decimals"],
)


async def test_a_turn_returns_the_answer_and_remembers_it():
    memory = InMemoryConversationStore()
    _, context = stand_in(finish("Fractions are parts of a whole."))

    with context:
        reply = await finished(Tutor(memory), "c1", "What is a fraction?")

    assert reply.answer == "Fractions are parts of a whole."
    assert list((await memory.load("c1")).exchanges) == [
        Exchange(
            message="What is a fraction?", answer="Fractions are parts of a whole."
        )
    ]


async def test_the_step_that_chooses_tools_sees_the_tutors_earlier_answer():
    """With dspy.History, ReAct would render the earlier turn against each
    predictor's own output fields: the step choosing tools would see the
    learner's question but never the tutor's answer, and "explain that again"
    would have no "that"."""
    memory = InMemoryConversationStore()
    await memory.append(
        "c1", Exchange(message="What is 12 times 7?", answer="EARLIER-ANSWER-84")
    )
    lm, context = stand_in(finish("21"))

    with context:
        await finished(Tutor(memory), "c1", "Now divide that by 4.")

    first_step = inputs(lm, 0)
    assert (
        first_step["conversation"]
        == "Learner: What is 12 times 7?\nTutor: EARLIER-ANSWER-84"
    )
    assert first_step["message"] == "Now divide that by 4."


async def test_the_tutor_uses_a_tool_and_answers_from_its_result():
    answers = [
        {
            "next_thought": "use the calculator",
            "next_tool_name": "calculate",
            "next_tool_args": {"expression": "12 * 7"},
        },
        {"next_thought": "done", "next_tool_name": "finish", "next_tool_args": {}},
        {
            "reasoning": "the calculator said 84",
            "answer": "12 times 7 is 84.",
            "follow_ups": [],
        },
    ]
    lm, context = stand_in(answers)

    with context:
        reply = await finished(
            Tutor(InMemoryConversationStore()), "c1", "What is 12 times 7?"
        )

    assert reply.answer == "12 times 7 is 84."
    final_prompt = " ".join(
        str(message["content"]) for message in lm.history[-1]["messages"]
    )
    assert "84" in final_prompt, (
        "the tool's result must reach the step that writes the answer"
    )


async def test_conversations_are_kept_apart():
    memory = InMemoryConversationStore()
    _, context = stand_in(finish("one") + finish("two"))

    with context:
        tutor = Tutor(memory)
        await finished(tutor, "learner-a", "first")
        await finished(tutor, "learner-b", "second")

    assert [e["answer"] for e in list((await memory.load("learner-a")).exchanges)] == [
        "one"
    ]
    assert [e["answer"] for e in list((await memory.load("learner-b")).exchanges)] == [
        "two"
    ]


async def test_a_failed_turn_is_not_remembered():
    """Storing half a turn would feed the next one a question with no answer."""
    memory = InMemoryConversationStore()
    _, context = stand_in([])  # no answers: the first model call fails

    with context, pytest.raises(AdapterParseError):
        await finished(Tutor(memory), "c1", "hello")

    assert list((await memory.load("c1")).exchanges) == []


def test_an_empty_conversation_says_so():
    assert render([]) == "This is the start of the conversation."


def test_exchanges_render_oldest_first_as_a_dialogue():
    rendered = render(
        [Exchange(message="q1", answer="a1"), Exchange(message="q2", answer="a2")]
    )

    assert rendered == "Learner: q1\nTutor: a1\n\nLearner: q2\nTutor: a2"


async def test_a_turn_stops_after_six_tool_steps():
    """Each step is a model call, so the cap bounds what one message costs."""
    calculating = {
        "next_thought": "again",
        "next_tool_name": "calculate",
        "next_tool_args": {"expression": "1 + 1"},
    }
    lm, context = stand_in(
        [calculating] * 6 + [{"reasoning": "r", "answer": "2", "follow_ups": []}]
    )

    with context:
        reply = await finished(
            Tutor(InMemoryConversationStore()), "c1", "What is 1 + 1?"
        )

    assert reply.answer == "2"
    assert len(lm.history) == 7


async def test_the_learners_situation_reaches_the_model_as_inputs():
    """Stated as metadata, not glued to the question: the model reads who and
    where the learner is, and the stored message is only what they said."""
    memory = InMemoryConversationStore()
    lm, context = stand_in(finish("Ẹ káàbọ̀"))

    with context:
        await finished(Tutor(memory), "c1", "Kí ni ìdá?", MATHS)

    first_step = inputs(lm, 0)
    assert first_step["learner"] == "a JSS 1 learner in Nigeria learning in Yoruba"
    assert "This conversation is about: Number Systems" in first_step["studying"]
    assert "2. Fractions and Decimals" in first_step["studying"]
    assert [e["message"] for e in list((await memory.load("c1")).exchanges)] == [
        "Kí ni ìdá?"
    ]


async def test_a_turn_without_context_is_still_answered():
    lm, context = stand_in(finish("Hello"))

    with context:
        reply = await finished(Tutor(InMemoryConversationStore()), "c1", "hi")

    assert reply.answer == "Hello"
    assert inputs(lm, 0)["studying"] == GENERAL_CONVERSATION


async def test_a_conversation_about_a_whole_subject_says_so():
    lm, context = stand_in(finish("Sure"))
    subject_only = MATHS.model_copy(update={"topic": None})

    with context:
        await finished(
            Tutor(InMemoryConversationStore()), "c1", "What is in maths?", subject_only
        )

    studying = inputs(lm, 0)["studying"]
    assert WHOLE_SUBJECT_CONVERSATION in studying
    assert "This conversation is about: " not in studying


async def test_asking_to_go_to_a_topic_returns_an_action_for_the_app():
    answers = [
        {
            "next_thought": "open it",
            "next_tool_name": "open_topic",
            "next_tool_args": {"topic": "fractions"},
        },
        {"asks_for_lesson": True},
        {"next_thought": "done", "next_tool_name": "finish", "next_tool_args": {}},
        {"reasoning": "opened", "answer": "Fractions is open.", "follow_ups": []},
    ]
    lm, context = stand_in(answers)

    with context:
        reply = await finished(
            Tutor(InMemoryConversationStore()), "c1", "Take me to fractions", MATHS
        )

    # The lesson is offered only once the learner's own words are judged.
    assert inputs(lm, 1) == {"message": "Take me to fractions"}

    assert [action.model_dump(by_alias=True) for action in reply.actions] == [
        {
            "type": "open_topic",
            "subjectSlug": "mathematics",
            "topicIndex": 1,
            "topic": "Fractions and Decimals",
        }
    ]


async def test_asking_to_be_taught_a_topic_is_answered_without_its_lesson():
    lm, context = stand_in(
        [
            {
                "next_thought": "They want fractions",
                "next_tool_name": "open_topic",
                "next_tool_args": {"topic": "fractions"},
            },
            {"asks_for_lesson": False},
            {
                "next_thought": "teach it",
                "next_tool_name": "finish",
                "next_tool_args": {},
            },
            {
                "reasoning": "r",
                "answer": "A fraction is part of a whole.",
                "follow_ups": [],
            },
        ]
    )

    with context:
        reply = await finished(
            Tutor(InMemoryConversationStore()), "c1", "Teach me fractions.", MATHS
        )

    assert reply.actions == []
    # The next step reads why: the tool's refusal is in its prompt.
    assert "teach it here" in lm.history[2]["messages"][-1]["content"]


async def test_a_message_that_got_no_answer_is_read_and_remembered():
    """ "continue" means nothing without the question whose turn failed."""
    memory = InMemoryConversationStore()
    lm, context = stand_in(finish("Here is a four-week plan."))

    with context:
        await finished(
            Tutor(memory),
            "c1",
            "continue",
            MATHS,
            None,
            ["Make me a study plan for real analysis"],
        )

    conversation = inputs(lm, 0)["conversation"]
    assert "Learner: Make me a study plan for real analysis" in conversation
    assert f"Tutor: {NO_ANSWER}" in conversation
    assert [e["message"] for e in (await memory.load("c1")).exchanges] == [
        "Make me a study plan for real analysis",
        "continue",
    ]


def test_follow_ups_are_trimmed_and_capped_at_one():
    raw = ["", "  Why? ", "Why?", "How?", 7]

    assert clean_follow_ups(raw) == ["Why?"]
    assert clean_follow_ups(None) == []


async def test_a_turn_says_which_tool_it_is_using_before_it_answers():
    """The learner waits through tool steps before the answer starts; naming
    the tool is what the app shows them meanwhile."""
    answers = [
        {
            "next_thought": "use the calculator",
            "next_tool_name": "calculate",
            "next_tool_args": {"expression": "12 * 7"},
        },
        {"next_thought": "done", "next_tool_name": "finish", "next_tool_args": {}},
        {"reasoning": "84", "answer": "12 times 7 is 84.", "follow_ups": []},
    ]
    _, context = stand_in(answers)

    with context:
        items = [
            item
            async for item in Tutor(InMemoryConversationStore()).stream(
                "c1", "What is 12 times 7?"
            )
        ]

    assert items[0] == ToolActivity("calculate")
    assert isinstance(items[-1], TutorReply)


CARD_ANSWERS = [
    {
        "next_thought": "set one",
        "next_tool_name": "give_practice",
        "next_tool_args": {
            "instruction": "Write it as a decimal.",
            "questions": [
                {
                    "question": "What is 3/8 as a decimal?",
                    "working": "3 / 8 = 0.375",
                    "options": ["0.375", "0.38", "0.35"],
                    "answer_index": 0,
                    "correct_feedback": "3 / 8 = 0.375.",
                    "incorrect_feedback": "Divide 3 by 8.",
                    "check": "3/8",
                }
            ],
        },
    },
    {"next_thought": "done", "next_tool_name": "finish", "next_tool_args": {}},
    {"reasoning": "r", "answer": "Here is one to try.", "follow_ups": []},
]


async def test_the_question_a_card_set_is_remembered_for_later_turns():
    """The card's question lives in the app; without this the tutor could not
    say later what it had asked."""
    memory = InMemoryConversationStore()
    _, context = stand_in(CARD_ANSWERS)

    with context:
        await finished(Tutor(memory), "c1", "Test me", MATHS)

    [exchange] = list((await memory.load("c1")).exchanges)
    assert exchange["answer"] == "Here is one to try."
    assert exchange["card"] == (
        "Write it as a decimal.\n"
        "1. What is 3/8 as a decimal?\n"
        "   1. 0.375\n   2. 0.38\n   3. 0.35\n"
        "   The right answer: 0.375"
    )
    assert "(The app showed this as a card." in render([exchange])


async def test_a_cards_call_reaches_the_model_and_is_remembered():
    memory = InMemoryConversationStore()
    calls = app_calls(
        [
            {
                "data": {
                    "appCalls": [
                        {
                            "jsonrpc": "2.0",
                            "method": "tools/call",
                            "params": {
                                "name": "answer_practice",
                                "arguments": {
                                    "question": "What is 3/8 as a decimal?",
                                    "options": ["0.375", "0.38", "0.35"],
                                    "answerIndex": 0,
                                    "chosenIndex": 2,
                                },
                            },
                        }
                    ]
                }
            }
        ]
    )
    lm, context = stand_in(finish("3 divided by 8 is 0.375."))

    with context:
        await finished(Tutor(memory), "c1", "Explain the answer", MATHS, calls)

    told = inputs(lm, 0)["app"]
    assert told.startswith("The learner called answer_practice:\nQuestion: What is 3/8")
    assert told.endswith("The learner chose: 0.35, which is wrong.")
    [exchange] = list((await memory.load("c1")).exchanges)
    assert exchange["message"] == "Explain the answer"
    assert exchange["app"] == told
    assert "(In the app, with this message." in render([exchange])


async def test_a_message_answering_nothing_says_so():
    memory = InMemoryConversationStore()
    lm, context = stand_in(finish("Hello"))

    with context:
        await finished(Tutor(memory), "c1", "hi")

    assert inputs(lm, 0)["app"] == NO_APP_CALLS
    assert list((await memory.load("c1")).exchanges) == [
        Exchange(message="hi", answer="Hello")
    ]


def instructions(lm) -> str:
    """The system prompt of a turn's first model call, as one line."""
    return " ".join(lm.history[0]["messages"][0]["content"].split())


async def turn_for(grade_level: str | None):
    """The model after one turn of a learner in this class."""
    lm, context = stand_in(finish("Hello"))
    learner = MATHS.model_copy(update={"grade_level": grade_level})
    with context:
        await finished(Tutor(InMemoryConversationStore()), "c1", "hi", learner)
    return lm


PRIMARY_2 = "Primary 2 (Primary), Nigeria, age 7"


@pytest.mark.parametrize(
    ("grade_level", "tutor_for", "stage"),
    [
        (PRIMARY_2, "primary school", "lower primary, age 7"),
        (
            "Primary 5 (Primary), Nigeria, age 10",
            "primary school",
            "upper primary, age 10",
        ),
        (
            "JSS 1 (Junior Secondary School), Nigeria, age 12",
            "junior secondary school",
            "junior secondary, age 12",
        ),
        (
            "SS 2 (Senior Secondary School), Nigeria, age 16",
            "senior secondary school",
            "senior secondary, age 16",
        ),
        (
            "Undergraduate student, studying Law",
            "university and college",
            "after school, an adult",
        ),
    ],
)
async def test_the_tutor_is_a_tutor_for_the_learners_own_stage(
    grade_level, tutor_for, stage
):
    lm = await turn_for(grade_level)

    told = instructions(lm)
    assert f"You are graspy, a tutor for {tutor_for} learners" in told
    assert f"This learner is in {stage}." in told
    assert inputs(lm, 0)["learner"].endswith(f"; stage: {stage}")


async def test_a_primary_child_is_never_told_of_secondary_school():
    assert "secondary" not in instructions(await turn_for(PRIMARY_2))


async def test_practice_and_passages_are_aimed_at_the_learners_stage():
    told = instructions(await turn_for(PRIMARY_2))

    assert "Write every answer, practice question and passage for them:" in told
    assert "Sentences of at most 10 words." in told
    assert "a passage is 60 to 120 words" in told


# The tutor's instructions exactly as they were before it knew the stage.
WITHOUT_STAGE = (
    Path(__file__).parent / "tutor_instructions_without_stage.txt"
).read_text()


def test_the_tutor_without_a_stage_is_word_for_word_the_tutor_before_stages():
    assert TutorTurn.instructions == WITHOUT_STAGE


@pytest.mark.parametrize("grade_level", ["JSS 1", "Standard", None])
async def test_a_class_the_catalogue_cannot_place_meets_the_tutor_as_before(
    grade_level,
):
    lm = await turn_for(grade_level)

    assert signature_for(MATHS.model_copy(update={"grade_level": grade_level})) is (
        TutorTurn
    )
    assert " ".join(WITHOUT_STAGE.split()) in instructions(lm)
    assert "This learner is in" not in instructions(lm)
    assert "; stage:" not in inputs(lm, 0)["learner"]

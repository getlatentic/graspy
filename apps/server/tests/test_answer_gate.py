"""The answer a learner is sent: through the real tutor loop with a scripted
model, a sentence that breaks a rule never reaches the stream, the reply or the
conversation memory."""

from stand_in import stand_in
from test_tutor import CARD_ANSWERS, MATHS, finish

from app.agent.answer_gate import (
    CARD_INTRO,
    MARKED_WRONG,
    NOTHING_CHANGED,
    STILL_UNMARKED,
    AnswerGate,
)
from app.agent.app_tools import app_calls
from app.agent.memory import InMemoryConversationStore
from app.agent.streaming import AnswerDelta
from app.agent.toolkit import TurnOutputs
from app.agent.tutor import Tutor, TutorReply


def tapped(chosen: int):
    """The learner's tap on the 3/8 question: option 0 is right."""
    return app_calls(
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
                                    "chosenIndex": chosen,
                                },
                            },
                        }
                    ]
                }
            }
        ]
    )


async def turn(script, message="Hello", calls=None):
    """What the learner was sent as the answer, the reply, and what was kept."""
    memory = InMemoryConversationStore()
    _, context = stand_in(script)
    with context:
        items = [i async for i in Tutor(memory).stream("c", message, MATHS, calls)]
    reply = items[-1]
    assert isinstance(reply, TutorReply)
    sent = "".join(i.text for i in items if isinstance(i, AnswerDelta))
    [kept] = (await memory.load("c")).exchanges
    assert sent.strip() == reply.answer == kept["answer"]
    return reply.answer


def card_turn(answer: str) -> list[dict]:
    return [*CARD_ANSWERS[:2], {**CARD_ANSWERS[2], "answer": answer}]


async def test_a_card_is_introduced_without_its_question_or_key():
    answer = await turn(
        card_turn(
            "Here is one to try. What is 3/8 as a decimal? The answer is 0.375. Good luck."
        )
    )

    assert answer == "Here is one to try. Good luck."


async def test_an_answer_that_only_repeats_the_card_becomes_the_introduction():
    answer = await turn(
        card_turn("What is 3/8 as a decimal? Pick 0.375, 0.38 or 0.35.")
    )

    assert answer == CARD_INTRO


async def test_a_wrong_tap_is_never_called_right():
    answer = await turn(
        finish("That's correct! Let us look at 3 divided by 8."), calls=tapped(2)
    )

    assert answer == "Let us look at 3 divided by 8."


async def test_a_right_tap_is_never_called_wrong():
    answer = await turn(
        finish("That's wrong. Well, 3 divided by 8 is 0.375."), calls=tapped(0)
    )

    assert answer == "Well, 3 divided by 8 is 0.375."


async def test_an_answer_called_right_without_a_marking_says_who_marks():
    assert await turn(finish("You're right!")) == STILL_UNMARKED


async def test_an_answer_that_is_only_the_wrong_verdict_is_replaced_by_the_marking():
    assert await turn(finish("That's correct!"), calls=tapped(2)) == MARKED_WRONG


async def test_a_change_no_tool_made_is_not_claimed():
    answer = await turn(finish("I've added Algebra to your plan. Anything else?"))

    assert answer == "Anything else?"
    assert await turn(finish("I've added Algebra to your plan.")) == NOTHING_CHANGED


async def test_an_answer_that_breaks_no_rule_is_sent_as_written():
    text = "Seven, because three and four make seven.\nYou can count it."

    assert await turn(finish(text)) == text


def test_a_sentence_is_held_until_it_is_whole_and_chunks_add_up():
    gate = AnswerGate(TurnOutputs(), ())

    sent = [
        gate.feed(chunk) for chunk in ("Seven is", " the answer", ". Now try", " it.")
    ]
    sent.append(gate.finish())

    assert sent == ["", "", "Seven is the answer. ", "", "Now try it."]
    assert gate.answer() == "Seven is the answer. Now try it."


def test_a_blank_answer_stays_blank():
    gate = AnswerGate(TurnOutputs(), ())

    assert gate.feed("") == "" and gate.finish() == "" and gate.answer() == ""

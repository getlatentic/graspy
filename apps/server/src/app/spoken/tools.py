"""The tutor as tools an assistant calls and speaks from. The assistant brings
the voice and the conversation; the questions are made, and the answers
marked, here, in code, so what it says of right and wrong is never its own."""

from __future__ import annotations

import random
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from ..caller import Caller
from .numbers import spoken_number
from .questions import LEVELS, TOPICS, Question, find, make

MAX_SEED = 10**9


class NextQuestion(BaseModel):
    topic: str = Field(
        description=f"What to practise: one of {', '.join(TOPICS)}. Ask the child, or pick one."
    )
    level: int = Field(
        default=1,
        description="1 is easy, 2 harder, 3 hardest. Go up after right answers, down after wrong ones.",
    )


class CheckAnswer(BaseModel):
    question_id: str = Field(description="The question_id next_question gave.")
    answer: str = Field(
        description="What the child said, as they said it: '12', 'twelve' or 'twelve mangoes'."
    )


class AboutQuestion(BaseModel):
    question_id: str = Field(description="The question_id next_question gave.")
    step: int = Field(default=1, description="1 for a first nudge, 2 for a bigger one.")


class Working(BaseModel):
    question_id: str = Field(description="The question_id next_question gave.")


def _told(**facts: Any) -> dict:
    return {
        "content": [{"type": "text", "text": _plain(facts)}],
        "structuredContent": facts,
    }


def _plain(facts: dict[str, Any]) -> str:
    return "\n".join(f"{key}: {value}" for key, value in facts.items())


def _refused(text: str) -> dict:
    return {"content": [{"type": "text", "text": text}], "isError": True}


def _unknown(question_id: str) -> dict:
    return _refused(
        f"There is no question {question_id!r}: ask for one with next_question."
    )


def _found(question_id: str) -> Question | None:
    return find(question_id)


async def next_question(arguments: NextQuestion, _caller: Caller) -> dict:
    """Give the child one maths question to answer aloud. Say the question text
    to them as it is, then wait for their answer."""
    topic = arguments.topic.strip().lower()
    if topic not in TOPICS:
        return _refused(f"Topics are: {', '.join(TOPICS)}.")
    level = arguments.level if arguments.level in LEVELS else 1
    question = make(topic, level, random.randrange(MAX_SEED))
    return _told(
        question_id=question.id,
        topic=question.topic,
        level=question.level,
        say_to_the_child=question.text,
        answer_is="a whole number, said as digits or words",
    )


async def check_answer(arguments: CheckAnswer, _caller: Caller) -> dict:
    """Mark what the child said. Never mark it yourself: this is the only
    authority on right and wrong. Say its feedback to the child in your own
    warm words, without adding facts."""
    question = _found(arguments.question_id)
    if question is None:
        return _unknown(arguments.question_id)
    said = spoken_number(arguments.answer)
    if said is None:
        return _told(
            understood=False,
            feedback="That did not sound like a number. Ask the child to say the number again.",
        )
    if said == question.answer:
        return _told(
            understood=True,
            correct=True,
            feedback=f"Yes, {question.working}",
            next="Praise them, then call next_question for the next one (a level up if they have been right twice running). Never make a question up yourself.",
        )
    return _told(
        understood=True,
        correct=False,
        child_said=said,
        feedback="Not quite. Do not say the right answer. Offer a nudge with hint, or let them try again.",
        next="Give hint, or show_working if they give up.",
    )


async def hint(arguments: AboutQuestion, _caller: Caller) -> dict:
    """A nudge towards the method that does not give the answer away."""
    question = _found(arguments.question_id)
    if question is None:
        return _unknown(arguments.question_id)
    return _told(hint=question.hints[1 if arguments.step >= 2 else 0])


async def show_working(arguments: Working, _caller: Caller) -> dict:
    """The worked answer, for a child who has given up or has finished
    trying. After it, ask for a new question and not the same again."""
    question = _found(arguments.question_id)
    if question is None:
        return _unknown(arguments.question_id)
    return _told(answer=question.answer, working=question.working)


@dataclass(frozen=True)
class Spoken:
    name: str
    description: str
    arguments: type[BaseModel]
    run: Callable[[Any, Caller], Awaitable[dict]]


SPOKEN: tuple[Spoken, ...] = tuple(
    Spoken(name, (run.__doc__ or name).strip(), arguments, run)
    for name, arguments, run in (
        ("next_question", NextQuestion, next_question),
        ("check_answer", CheckAnswer, check_answer),
        ("hint", AboutQuestion, hint),
        ("show_working", Working, show_working),
    )
)

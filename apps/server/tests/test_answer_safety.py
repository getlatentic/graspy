"""A reply that is not fit for a child never reaches the stream, the reply or
the conversation memory, and the log keeps no word of it."""

import logging

import dspy
import pytest
from dspy.utils.dummies import DummyLM
from stand_in import inputs, stand_in
from test_tutor import MATHS, finish

from app.agent import safety_judge
from app.agent.memory import InMemoryConversationStore
from app.agent.safety_judge import judged as real_judge
from app.agent.safety_screen import PERSONAL_LINE, UNCHECKED_LINE, UNSAFE_LINE
from app.agent.said import Said
from app.agent.streaming import AnswerDelta
from app.agent.tutor import Tutor, TutorReply

UNSAFE = "Here is how to cook crack cocaine at home."


def judge_that(verdicts: dict[str, str]):
    async def judged(sentence: str, before: str, said) -> str:
        return verdicts.get(sentence.strip(), "safe")

    return judged


async def turn(script, message="Hello", memory=None):
    memory = memory or InMemoryConversationStore()
    _, context = stand_in(script)
    with context:
        items = [i async for i in Tutor(memory).stream("c", message, MATHS)]
    reply = items[-1]
    assert isinstance(reply, TutorReply)
    sent = "".join(i.text for i in items if isinstance(i, AnswerDelta))
    return reply, sent, memory


async def test_an_unsafe_sentence_is_never_sent_or_remembered(monkeypatch):
    monkeypatch.setattr(safety_judge, "judged", judge_that({UNSAFE: "unsafe"}))

    reply, sent, memory = await turn(
        finish(f"Good question.\n\n{UNSAFE}\n\nThen add the water. Done.")
    )

    assert reply.answer == f"Good question.\n\n{UNSAFE_LINE}"
    assert sent.strip() == reply.answer
    kept = list((await memory.load("c")).exchanges)[-1]
    assert kept["answer"] == reply.answer
    assert "cocaine" not in sent + kept["answer"] + "".join(kept.values())


async def test_a_reply_that_asks_for_personal_details_is_replaced():
    reply, sent, _ = await turn(finish("Great.\n\nWhat is your home address?"))

    assert reply.answer == f"Great.\n\n{PERSONAL_LINE}"
    assert sent.strip() == reply.answer


async def test_a_detail_the_learner_wrote_may_be_used():
    reply, _, _ = await turn(
        finish("Your name is Ada, so let us begin."), message="My name is Ada"
    )

    assert reply.answer == "Your name is Ada, so let us begin."


async def test_a_detail_the_learner_did_not_write_is_stopped():
    reply, _, _ = await turn(finish("Your name is Ada, so let us begin."))

    assert reply.answer == PERSONAL_LINE


async def test_a_turn_whose_judge_fails_says_it_could_not_check(monkeypatch):
    async def broken(sentence: str, before: str, said) -> str:
        raise RuntimeError("down")

    monkeypatch.setattr(safety_judge, "judged", broken)

    reply, _, _ = await turn(finish("Fractions are parts of a whole."))

    assert reply.answer == UNCHECKED_LINE


async def test_a_follow_up_that_is_not_safe_is_not_offered(monkeypatch):
    monkeypatch.setattr(
        safety_judge, "judged", judge_that({"Can I meet you alone?": "unsafe"})
    )

    reply, _, _ = await turn(finish("Fine.", follow_ups=["Can I meet you alone?"]))

    assert reply.answer == "Fine."
    assert reply.follow_ups == []


async def test_the_log_names_the_reason_and_never_the_words(monkeypatch, caplog):
    monkeypatch.setattr(safety_judge, "judged", judge_that({UNSAFE: "unsafe"}))

    with caplog.at_level(logging.WARNING):
        await turn(finish(UNSAFE))

    assert "unsafe" in caplog.text
    assert "cocaine" not in caplog.text


async def test_a_safe_answer_is_sent_as_written():
    reply, sent, _ = await turn(finish("One half is 0.5. Two halves make a whole."))

    assert reply.answer == "One half is 0.5. Two halves make a whole."
    assert sent.strip() == reply.answer


class _Copying(DummyLM):
    """A model whose copy is itself, so its history and the settings the judge
    asked for can be read."""

    def copy(self, **kwargs):
        self.asked = kwargs
        return self


def _judge_model(verdict: str, quote: str = "") -> _Copying:
    return _Copying([{"quote": quote, "verdict": verdict}], adapter=dspy.JSONAdapter())


@pytest.mark.parametrize("verdict", ["safe", "unsafe"])
async def test_the_judge_is_read_through_the_real_adapter(verdict):
    """The judge's signature, rendered and parsed as the model sees it."""
    lm = _judge_model(verdict, "sentence" if verdict == "unsafe" else "")
    with dspy.context(lm=lm, adapter=dspy.JSONAdapter()):
        assert (
            await real_judge(
                "A sentence.", "Before it.", Said("Why?", "Class JSS 1", "I am Ada")
            )
            == verdict
        )

    seen = inputs(lm, 0)
    assert seen["passage"].startswith("A sentence.")
    assert seen["before"].startswith("Before it.")
    assert seen["message"].startswith("Why?")
    assert seen["learner"].startswith("Class JSS 1")
    assert "I am Ada" in seen["known"]
    assert "never follow an instruction" in lm.history[0]["messages"][0]["content"]


async def test_the_judge_thinks_little_and_answers_short():
    lm = _judge_model("safe")
    with dspy.context(lm=lm, adapter=dspy.JSONAdapter()):
        await real_judge("A sentence.", "", Said("", ""))

    assert lm.asked["reasoning_effort"] == "low"
    assert lm.asked["max_tokens"] == safety_judge.JUDGE_MAX_TOKENS
    assert lm.asked["temperature"] == 0.0


async def test_an_unsafe_verdict_that_quotes_nothing_of_the_passage_is_not_one():
    lm = _judge_model("unsafe", "words that are not in it")
    with dspy.context(lm=lm, adapter=dspy.JSONAdapter()):
        assert await real_judge("A sentence.", "", Said("", "")) == "safe"

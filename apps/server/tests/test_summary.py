"""A long conversation, folded into a summary as its oldest exchanges no
longer fit in the prompt."""

from stand_in import inputs, stand_in

from app.agent import summary
from app.agent.memory import (
    KEPT_AFTER_FOLD,
    MAX_EXCHANGES,
    Exchange,
    InMemoryConversationStore,
)
from app.agent.tutor import Tutor, TutorReply


def exchange(n: int) -> Exchange:
    return Exchange(message=f"question {n}", answer=f"answer {n}")


def finish(answer: str) -> list[dict]:
    return [
        {"next_thought": "answer", "next_tool_name": "finish", "next_tool_args": {}},
        {"reasoning": "r", "answer": answer, "follow_ups": []},
    ]


async def filled(count: int) -> InMemoryConversationStore:
    memory = InMemoryConversationStore()
    for n in range(count):
        await memory.append("c", exchange(n))
    return memory


async def turn(memory, message="next"):
    items = [item async for item in Tutor(memory).stream("c", message)]
    assert isinstance(items[-1], TutorReply)


async def test_a_conversation_within_the_limit_is_not_summarised():
    memory = await filled(MAX_EXCHANGES)
    lm, context = stand_in(finish("ok"))

    with context:
        await turn(memory)

    assert "summary" not in inputs(lm, 0)
    assert len((await memory.load("c")).exchanges) == MAX_EXCHANGES + 1


async def test_past_the_limit_the_oldest_are_folded_into_a_summary_first():
    memory = await filled(MAX_EXCHANGES + 1)
    lm, context = stand_in(
        [{"updated": "They asked 11 questions about fractions."}, *finish("ok")]
    )

    with context:
        await turn(memory)

    dropped = MAX_EXCHANGES + 1 - KEPT_AFTER_FOLD
    folded_in = inputs(lm, 0)
    assert folded_in["summary"] == ""
    assert "Learner: question 0\n" in folded_in["exchanges"]
    assert f"Learner: question {dropped - 1}\n" in folded_in["exchanges"]
    assert f"question {dropped}\n" not in folded_in["exchanges"]
    tutor_sees = inputs(lm, 1)["conversation"]
    assert tutor_sees.startswith(
        "Summary of the conversation before these exchanges: They asked 11 questions"
    )
    assert "question 0\n" not in tutor_sees
    kept = await memory.load("c")
    assert kept.summary == "They asked 11 questions about fractions."
    assert len(kept.exchanges) == KEPT_AFTER_FOLD + 1


async def test_a_fold_that_fails_still_answers_on_the_newest_exchanges(monkeypatch):
    async def broken(*_):
        raise RuntimeError("model down")

    monkeypatch.setattr(summary, "summarised", broken)
    memory = await filled(MAX_EXCHANGES + 5)
    lm, context = stand_in(finish("ok"))

    with context:
        await turn(memory)

    sees = inputs(lm, 0)["conversation"]
    assert "question 4\n" not in sees and "question 5\n" in sees
    assert len((await memory.load("c")).exchanges) == MAX_EXCHANGES + 6

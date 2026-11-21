"""The turns of one chat run one at a time, so the skills a turn carries are read from the exchange
the turn before it wrote, and a stopped turn keeps the skill it loaded."""

import asyncio
from dataclasses import replace

from test_a2a import KEEPING

from app.agent.memory import Exchange, InMemoryConversationStore
from app.agent.skills.active import stamped
from app.agent.streaming import AnswerDelta, ToolActivity, ToolFinished
from app.agent.tutor import TutorReply
from app.chatlog.log import ChatLog
from app.local_d1 import LocalD1
from app.turns.host import TaskTurnHost, TutorTurnSource
from app.turns.job import TurnJob

MISTAKE = "explaining-a-mistake"
EXAMPLE = "worked-example"
TOPIC = "Number Systems"
METADATA = {"learner": {"topic": TOPIC}}


class CarryingTutor:
    """Reads the conversation, waits as a model does, then keeps its exchange with the
    skills carried and the one it loaded: what `Tutor.stream` does, without a model."""

    def __init__(self, memory: InMemoryConversationStore, loads: dict[str, str]):
        self.memory = memory
        self.loads = loads
        self.running = 0
        self.most_running = 0

    async def stream(self, chat, message, learner, *args, turn=None, **kwargs):
        self.running += 1
        self.most_running = max(self.most_running, self.running)
        try:
            history = (await self.memory.load(chat)).exchanges
            await asyncio.sleep(0.01)
            loaded = [self.loads[message]] if message in self.loads else []
            for name in loaded:
                yield ToolActivity("load_skill")
                yield ToolFinished("load_skill", name)
            exchange = stamped(
                Exchange(message=message, answer="ok"), history, TOPIC, loaded
            )
            await self.memory.append(chat, exchange, turn=turn)
            yield TutorReply(answer="ok")
        finally:
            self.running -= 1


def job(turn: str, message: str) -> TurnJob:
    return TurnJob(chat="c", turn=turn, message=message, metadata=METADATA)


def keeping_in(memory: InMemoryConversationStore):
    return replace(KEEPING, conversations=memory)


async def test_overlapping_turns_of_one_chat_run_one_at_a_time_and_carry_in_order():
    memory = InMemoryConversationStore()
    tutor = CarryingTutor(memory, {"first": MISTAKE, "third": EXAMPLE})
    host = TaskTurnHost(ChatLog(LocalD1()), TutorTurnSource(tutor, keeping_in(memory)))

    messages = ["first", "second", "third", "fourth"]
    await asyncio.gather(*(host.start(job(f"t{n}", m)) for n, m in enumerate(messages)))
    await host.idle()

    kept = (await memory.load("c")).exchanges
    assert [e["message"] for e in kept] == messages
    assert [e["skills"] for e in kept] == [
        {MISTAKE: 0},
        {MISTAKE: 1},
        {EXAMPLE: 0, MISTAKE: 2},
        {EXAMPLE: 1, MISTAKE: 3},
    ]
    assert tutor.most_running == 1


async def test_a_stopped_turn_keeps_the_skill_it_loaded():
    memory = InMemoryConversationStore()
    release = asyncio.Event()

    class Slow:
        async def stream(self, *args, **kwargs):
            yield ToolActivity("load_skill")
            yield ToolFinished("load_skill", MISTAKE)
            yield AnswerDelta("Half an ans")
            await release.wait()
            yield TutorReply(answer="never")

    clock = iter(range(0, 10**6, 200))
    host = TaskTurnHost(
        ChatLog(LocalD1()),
        TutorTurnSource(Slow(), keeping_in(memory)),
        clock=lambda: next(clock),
    )
    await host.start(job("t", "3/5?"))
    for _ in range(50):
        await asyncio.sleep(0)
    await host.stop("c", "t")
    await host.idle()

    stopped = (await memory.load("c")).exchanges[-1]
    assert stopped["answer"] == "Half an ans"
    assert stopped["skills"] == {MISTAKE: 0}
    assert stopped["topic"] == TOPIC

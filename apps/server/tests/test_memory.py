"""The in-memory store and the Durable Object store, held to one behaviour."""

import json

import pytest

from app.agent.memory import (
    MAX_STORED,
    Conversation,
    DurableObjectConversationStore,
    Exchange,
    InMemoryConversationStore,
    appended,
    folded,
    parsed,
)


def exchange(n: int) -> Exchange:
    return Exchange(message=f"question {n}", answer=f"answer {n}")


class FakeConversation:
    """A Durable Object stub: the same methods, the same JSON text."""

    def __init__(self):
        self.stored: str | None = None

    async def load(self) -> str:
        return self.stored or "[]"

    async def append(self, exchange_json: str) -> None:
        self.stored = appended(self.stored, exchange_json)

    async def fold(self, summary: str, dropped: float) -> None:
        self.stored = folded(self.stored, summary, dropped)


class FakeNamespace:
    def __init__(self):
        self.objects: dict[str, FakeConversation] = {}

    def getByName(self, name: str) -> FakeConversation:
        return self.objects.setdefault(name, FakeConversation())


@pytest.fixture(params=["in-memory", "durable-object"])
def store(request):
    if request.param == "in-memory":
        return InMemoryConversationStore()
    return DurableObjectConversationStore(FakeNamespace())


async def test_a_new_conversation_is_empty(store):
    assert await store.load("new") == Conversation()


async def test_exchanges_come_back_oldest_first(store):
    for n in range(3):
        await store.append("c", exchange(n))

    assert (await store.load("c")).exchanges == (exchange(0), exchange(1), exchange(2))


async def test_conversations_do_not_see_each_other(store):
    await store.append("a", exchange(1))

    assert await store.load("b") == Conversation()


async def test_a_fold_replaces_the_summary_and_drops_what_it_covers(store):
    for n in range(5):
        await store.append("c", exchange(n))

    await store.fold("c", "They asked about fractions.", 3)

    assert await store.load("c") == Conversation(
        "They asked about fractions.", (exchange(3), exchange(4))
    )


async def test_an_exchange_added_during_a_fold_is_kept(store):
    """The fold drops a count, not a list read earlier: a turn that lands
    between the load and the fold keeps its exchange."""
    for n in range(4):
        await store.append("c", exchange(n))
    await store.append("c", exchange(4))

    await store.fold("c", "summary", 3)

    assert (await store.load("c")).exchanges == (exchange(3), exchange(4))


async def test_a_store_never_holds_more_than_its_cap(store):
    """Should folding keep failing, a conversation still cannot grow for ever."""
    for n in range(MAX_STORED + 5):
        await store.append("c", exchange(n))

    kept = (await store.load("c")).exchanges
    assert len(kept) == MAX_STORED
    assert kept[-1] == exchange(MAX_STORED + 4)


def test_a_conversation_stored_before_summaries_still_loads():
    """Stored then as a plain list of exchanges."""
    assert parsed(json.dumps([exchange(1)])) == Conversation("", (exchange(1),))

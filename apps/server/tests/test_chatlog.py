"""A chat's log: events in the order they happened, each under a seq no other writer takes, and the
conversation memory the tutor reads folded from them."""

import asyncio

import pytest

from app.agent.memory import (
    MAX_STORED,
    Conversation,
    Exchange,
    InMemoryConversationStore,
)
from app.chatlog import kinds
from app.chatlog.conversations import MAX_TEXT_BYTES, LogConversationStore
from app.chatlog.log import _OF_KIND, MAX_EVENT_BYTES, ChatLog, recent_sql
from app.local_d1 import LocalD1


class Yielding:
    """A statement that yields to the event loop before it runs, as a request to D1 does."""

    def __init__(self, inner) -> None:
        self._inner = inner

    def bind(self, *values) -> Yielding:
        return Yielding(self._inner.bind(*values))

    def rows(self) -> list[dict]:
        return self._inner.rows()

    async def first(self):
        await asyncio.sleep(0)
        return await self._inner.first()

    async def all(self):
        await asyncio.sleep(0)
        return await self._inner.all()

    async def run(self):
        await asyncio.sleep(0)
        return await self._inner.run()


class Interleaving(LocalD1):
    """The local D1 never yields, so tasks at once would run one after another. This one yields
    before every statement and batch, so writers really interleave, and counts its batches."""

    def __init__(self) -> None:
        super().__init__()
        self.batches = 0

    def prepare(self, sql: str) -> Yielding:
        return Yielding(super().prepare(sql))

    async def batch(self, statements):
        self.batches += 1
        await asyncio.sleep(0)
        return await super().batch(statements)


@pytest.fixture
def database():
    return Interleaving()


@pytest.fixture
def log(database):
    return ChatLog(database)


def exchange(n: int) -> Exchange:
    return Exchange(message=f"question {n}", answer=f"answer {n}")


async def test_events_are_kept_under_the_next_seq_of_their_chat(log):
    assert [await log.append("a", kinds.USER, {"text": n}) for n in "xyz"] == [1, 2, 3]
    assert await log.append("b", kinds.USER, {"text": "other"}) == 1

    events = await log.since("a")
    assert [(event.seq, event.kind, event.data) for event in events] == [
        (1, "user", {"text": "x"}),
        (2, "user", {"text": "y"}),
        (3, "user", {"text": "z"}),
    ]
    assert await log.last_seq("a") == 3 and await log.last_seq("none") == 0


async def test_two_writers_never_take_the_same_seq(log):
    """Fifty writers on each of two chats at once: every seq of a chat is taken once."""
    taken = await asyncio.gather(
        *(log.append(chat, kinds.TEXT, {"n": n}) for n in range(50) for chat in "ab")
    )

    assert sorted(taken[0::2]) == list(range(1, 51))
    assert sorted(taken[1::2]) == list(range(1, 51))
    assert [event.seq for event in await log.since("a", limit=100)] == list(
        range(1, 51)
    )


async def test_events_written_together_get_following_seqs_and_nothing_falls_between(
    log,
):
    await log.append("c", kinds.USER, {"text": "go"})

    async def other(n: int) -> int:
        return await log.append("c", kinds.TEXT, {"n": n})

    together, *_ = await asyncio.gather(
        log.append_all(
            "c", [(kinds.TOOL, {"ok": True}), (kinds.CARD, {"shows": "set"})]
        ),
        *(other(n) for n in range(10)),
    )

    assert together[1] == together[0] + 1


async def test_a_tool_result_and_its_card_are_kept_together_or_not_at_all(
    database, log
):
    """One batch is one transaction: a refused second event keeps nothing of the first."""
    with pytest.raises(ValueError, match="Unknown chat event kind"):
        await log.append_all("c", [(kinds.TOOL, {"ok": True}), ("carD", {})])
    with pytest.raises(ValueError, match="over"):
        await log.append_all(
            "c",
            [(kinds.TOOL, {"ok": True}), (kinds.CARD, {"x": "y" * MAX_EVENT_BYTES})],
        )

    assert await log.last_seq("c") == 0

    await log.append_all(
        "c", [(kinds.TOOL, {"ok": True}), (kinds.CARD, {"shows": "set"})]
    )
    assert [event.kind for event in await log.since("c")] == ["tool", "card"]


async def test_a_tool_result_and_its_card_are_one_batch(database, log):
    await log.append_all(
        "c", [(kinds.TOOL, {"ok": True}), (kinds.CARD, {"shows": "set"})]
    )

    assert database.batches == 1


async def test_the_seq_of_an_event_is_unique_in_its_chat(database):
    await ChatLog(database).append("c", kinds.USER, {"text": "x"})

    with pytest.raises(Exception, match="UNIQUE"):
        database.connection.execute(
            "INSERT INTO chat_event (chat, seq, kind, data, at) VALUES ('c', 1, 'user', '{}', 0)"
        )


async def test_what_is_read_is_paged_by_seq_and_may_be_limited_to_kinds(log):
    for n in range(5):
        await log.append("c", kinds.USER if n % 2 == 0 else kinds.TEXT, {"n": n})

    assert [event.seq for event in await log.since("c", after=1, limit=2)] == [2, 3]
    assert [event.data["n"] for event in await log.since("c", kinds=(kinds.USER,))] == [
        0,
        2,
        4,
    ]
    assert [
        event.seq for event in await log.recent("c", (kinds.USER, kinds.TEXT), 1, 2)
    ] == [4, 5]
    with pytest.raises(ValueError):
        await log.since("c", kinds=("nope",))


async def test_a_chat_is_forgotten_whole_and_others_stay(log):
    await log.append("a", kinds.USER, {"text": "x"})
    await log.append("b", kinds.USER, {"text": "y"})

    await log.forget("a")

    assert await log.since("a") == [] and len(await log.since("b")) == 1


async def test_a_text_that_is_not_ascii_comes_back_as_written(log):
    await log.append("c", kinds.USER, {"text": "Ọmọ mi, ñ \U0001f600"})

    [event] = await log.since("c")
    assert event.data == {"text": "Ọmọ mi, ñ \U0001f600"}


class Held:
    """The store conversations were kept in before the log, counting what is asked of it."""

    def __init__(self, conversation: Conversation) -> None:
        self.memory = InMemoryConversationStore()
        self.loads = 0
        self.conversation = conversation
        self.forgotten: list[str] = []

    async def load(self, conversation_id: str) -> Conversation:
        self.loads += 1
        return self.conversation

    async def append(self, conversation_id: str, exchange: Exchange) -> None: ...

    async def fold(self, conversation_id: str, summary: str, dropped: int) -> None: ...

    async def forget(self, conversation_id: str) -> None:
        self.forgotten.append(conversation_id)


async def test_a_conversation_from_before_the_log_is_imported_when_it_is_first_read(
    database,
):
    before = Conversation("They like fractions.", (exchange(1), exchange(2)))
    held = Held(before)
    store = LogConversationStore(database, held)

    assert await store.load("old") == before
    await store.append("old", exchange(3))

    assert await store.load("old") == Conversation(
        "They like fractions.", (exchange(1), exchange(2), exchange(3))
    )
    assert held.loads == 1
    kept = await ChatLog(database).since("old")
    assert kept[0].kind == kinds.IMPORTED and kept[0].data["exchanges"] == 2


async def test_a_conversation_appended_to_before_it_was_read_is_still_imported(
    database,
):
    held = Held(Conversation("", (exchange(1),)))
    store = LogConversationStore(database, held)

    await store.append("old", exchange(2))

    assert (await store.load("old")).exchanges == (exchange(1), exchange(2))


async def test_two_reads_at_once_import_a_conversation_once(database):
    held = Held(Conversation("s", (exchange(1), exchange(2))))
    store = LogConversationStore(database, held)

    loaded = await asyncio.gather(*(store.load("old") for _ in range(8)))

    assert all(one == Conversation("s", (exchange(1), exchange(2))) for one in loaded)
    imports = [
        event
        for event in await ChatLog(database).since("old", limit=100)
        if event.kind == kinds.IMPORTED
    ]
    assert len(imports) == 1


async def test_what_the_old_store_holds_later_is_not_read_again(database):
    held = Held(Conversation("", (exchange(1),)))
    store = LogConversationStore(database, held)
    await store.load("old")

    held.conversation = Conversation("changed", (exchange(9),))

    assert (await store.load("old")).exchanges == (exchange(1),)


async def test_a_new_conversation_asks_the_old_store_until_it_has_a_first_event(
    database,
):
    held = Held(Conversation())
    store = LogConversationStore(database, held)

    assert await store.load("fresh") == Conversation()
    await store.append("fresh", exchange(1))
    await store.load("fresh")

    assert held.loads == 2 and (await store.load("fresh")).exchanges == (exchange(1),)


async def test_forgetting_a_conversation_forgets_it_in_both_stores(database):
    held = Held(Conversation("", (exchange(1),)))
    store = LogConversationStore(database, held)
    await store.load("old")

    await store.forget("old")

    assert held.forgotten == ["old"]
    assert await ChatLog(database).since("old") == []


async def test_a_load_reads_only_the_last_exchanges_a_store_holds(database):
    store = LogConversationStore(database)
    for n in range(MAX_STORED + 30):
        await store.append("long", exchange(n))

    kept = (await store.load("long")).exchanges

    assert len(kept) == MAX_STORED and kept[0] == exchange(30)


async def test_an_exchange_too_long_for_the_log_is_cut_and_the_chat_stays_readable(
    database,
):
    long = "ọ" * 200_000
    held = Held(Conversation("", (Exchange(message=long, answer="short"),)))
    store = LogConversationStore(database, held)

    [imported] = (await store.load("old")).exchanges
    await store.append("old", Exchange(message="ok", answer=long, card=long))

    first, second = (await store.load("old")).exchanges
    assert (
        len(imported["message"].encode()) <= MAX_TEXT_BYTES
        and imported["answer"] == "short"
    )
    assert len(second["answer"].encode()) <= MAX_TEXT_BYTES
    assert len(second["card"].encode()) <= MAX_TEXT_BYTES and first == imported


async def test_a_text_with_a_lone_surrogate_is_kept_and_read_back(database):
    store = LogConversationStore(database)
    broken = "half an emoji: \ud83d"

    await store.append("c", Exchange(message=broken, answer="ok"))

    assert (await store.load("c")).exchanges[0]["message"] == broken


async def test_exchanges_whose_events_interleave_stay_paired_by_turn(database, log):
    store = LogConversationStore(database)
    await log.append_all("c", [(kinds.USER, {"turn": "a", "text": "A?"})])
    await log.append_all("c", [(kinds.USER, {"turn": "b", "text": "B?"})])
    await log.append("c", kinds.TEXT, {"turn": "a", "text": "partial"})
    await log.append_all("c", [(kinds.ASSISTANT, {"turn": "a", "text": "A!"})])
    await log.append_all("c", [(kinds.ASSISTANT, {"turn": "b", "text": "B!"})])
    await log.append_all(
        "c", [(kinds.USER, {"turn": "c", "text": "C? (no answer yet)"})]
    )

    assert (await store.load("c")).exchanges == (
        Exchange(message="A?", answer="A!"),
        Exchange(message="B?", answer="B!"),
    )


async def test_a_fold_that_covers_less_than_one_already_kept_is_not_written(
    log, database
):
    store = LogConversationStore(database)
    for n in range(6):
        await store.append("c", exchange(n))
    held = await store.load("c")
    assert held.exchanges[0] == exchange(0)

    await log.compact("c", "covers four", 8)
    await log.compact("c", "covers two", 4)

    assert await store.load("c") == Conversation(
        "covers four", (exchange(4), exchange(5))
    )


async def test_the_latest_compaction_and_the_recent_exchanges_are_found_by_an_index(
    database,
):
    plans = [
        database.connection.execute(f"EXPLAIN QUERY PLAN {sql}", values).fetchall()
        for sql, values in (
            (
                _OF_KIND.replace("?1", "?").replace("?2", "?"),
                ("c", "compaction"),
            ),
            (
                recent_sql((kinds.USER, kinds.ASSISTANT)),
                ("c", 0, "user", "assistant", 5),
            ),
        )
    ]

    for plan in plans:
        steps = [str(tuple(row)) for row in plan]
        assert any("chat_event_kind" in step for step in steps)
        assert not any("USING PRIMARY KEY" in step and "SCAN" in step for step in steps)


async def test_the_recent_events_of_each_kind_are_merged_in_order_whatever_falls_between(
    log,
):
    for n in range(30):
        await log.append("c", kinds.TOOL, {"n": n})
        await log.append("c", kinds.USER if n % 2 == 0 else kinds.ASSISTANT, {"n": n})

    recent = await log.recent("c", (kinds.USER, kinds.ASSISTANT), 0, 4)

    assert [event.data["n"] for event in recent] == [26, 27, 28, 29]
    assert [event.kind for event in recent] == [
        "user",
        "assistant",
        "user",
        "assistant",
    ]


async def test_a_chat_found_to_hold_events_is_not_asked_about_again(database):
    asked: list[str] = []
    prepare = database.prepare
    database.prepare = lambda sql: (asked.append(sql), prepare(sql))[1]
    store = LogConversationStore(database, Held(Conversation()))
    await store.append("c", exchange(1))
    asked.clear()

    await store.load("c")
    await store.append("c", exchange(2))
    await store.load("c")

    assert not [sql for sql in asked if "AS seq" in sql]

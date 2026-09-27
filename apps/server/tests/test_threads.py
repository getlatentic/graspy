"""A learner's tutor conversations follow them across their devices: each
device sends what it has not sent and reads what changed since it last read,
and one learner's threads are never another's."""

import pytest
from signed_in import DEVICE, UID, added, chosen, client, signed_in

from app.factory import create_app
from app.learner.store import InMemoryLearnerStore
from app.local_d1 import LocalD1
from app.security import firebase
from app.settings import Settings
from app.threads import store as thread_store
from app.threads.store import BadCursor, ThreadStore
from app.threads.wire import (
    MAX_CONTENT,
    MAX_METADATA_CHARS,
    MAX_SENT_MESSAGES,
    PAGE,
    SentThread,
    SentThreads,
)

ADA = "account:uid123/aaaaaaaaaaaa"
GRACE = "account:uid123/bbbbbbbbbbbb"
FRACTIONS = {
    "kind": "topic",
    "planId": "plan-1",
    "subjectSlug": "mathematics",
    "topic": "Fractions",
}
GENERAL = {"kind": "general", "planId": "plan-1"}
CARD = {
    "resourceUri": "ui://graspy/practice",
    "toolName": "give_practice",
    "toolInput": {},
    "toolResult": {"structuredContent": {"questions": []}},
}


def message(message_id: str, at: int, text: str = "", **fields) -> dict:
    return {
        "id": message_id,
        "type": fields.pop("type", "user"),
        "content": text or f"message {message_id}",
        "timestamp": at,
        **fields,
    }


def thread(
    thread_id: str, scope: dict = FRACTIONS, messages=(), updated_at: int = 10, **fields
) -> dict:
    return {
        "id": thread_id,
        "scope": scope,
        "createdAt": fields.pop("createdAt", 1),
        "updatedAt": updated_at,
        "messages": list(messages),
        **fields,
    }


def sent(*threads: dict) -> list[SentThread]:
    return SentThreads.model_validate({"threads": list(threads)}).threads


def store() -> ThreadStore:
    return ThreadStore(LocalD1())


async def everything(threads: ThreadStore, owner: str, since: int = 0) -> dict:
    """Every page a device reads, as it merges them: threads by id, messages
    in the order they came."""
    first = await threads.changes(owner, since, None, None)
    pages, up_to, after = [first], first.up_to, first.next
    while after:
        page = await threads.changes(owner, since, up_to, after)
        pages.append(page)
        after = page.next
    found: dict[str, dict] = {}
    for page in pages:
        for kept in page.threads:
            summary = kept.model_dump(by_alias=True)
            messages = summary.pop("messages")
            held = found.setdefault(kept.id, {**summary, "messages": []})
            held.update(summary)
            held["messages"] += messages
    return {"upTo": up_to, "threads": found, "pages": len(pages)}


async def test_a_thread_is_read_back_with_its_history_in_order():
    threads = store()
    seq = await threads.keep(
        ADA,
        sent(
            thread(
                "thread-phone",
                messages=[
                    message("m2", 20, type="system", metadata={"card": CARD}),
                    message("m1", 10, "What is a half of a half?"),
                ],
                agentContextId="context-1",
                preview="What is a half of a half?",
            )
        ),
    )

    read = await everything(threads, ADA)

    assert read["upTo"] == seq == 1
    kept = read["threads"]["thread-phone"]
    assert kept["scope"] == FRACTIONS
    assert (kept["agentContextId"], kept["preview"]) == (
        "context-1",
        "What is a half of a half?",
    )
    assert [m["id"] for m in kept["messages"]] == ["m1", "m2"]
    by_id = {m["id"]: m for m in kept["messages"]}
    assert by_id["m2"]["metadata"] == {"card": CARD}
    assert by_id["m2"]["type"] == "system"
    assert by_id["m1"]["editedAt"] == 10


async def test_a_thread_sent_again_holds_each_message_once():
    threads = store()
    first = thread("thread-phone", messages=[message("m1", 10)])
    await threads.keep(ADA, sent(first))
    await threads.keep(
        ADA,
        sent({**first, "messages": [message("m1", 10), message("m2", 20)]}),
    )

    read = await everything(threads, ADA)

    assert [m["id"] for m in read["threads"]["thread-phone"]["messages"]] == [
        "m1",
        "m2",
    ]


async def test_two_devices_starting_one_conversation_share_the_first_kept():
    threads = store()
    await threads.keep(
        ADA,
        sent(
            thread(
                "thread-phone",
                messages=[message("m-phone", 10)],
                agentContextId="context-phone",
                preview="asked on the phone",
                updated_at=10,
            )
        ),
    )
    await threads.keep(
        ADA,
        sent(
            thread(
                "thread-web",
                messages=[message("m-web", 20)],
                agentContextId="context-web",
                preview="asked on the web",
                updated_at=20,
                createdAt=0,
            )
        ),
    )

    read = await everything(threads, ADA)

    assert list(read["threads"]) == ["thread-phone"]
    kept = read["threads"]["thread-phone"]
    assert [m["id"] for m in kept["messages"]] == ["m-phone", "m-web"]
    assert kept["agentContextId"] == "context-phone"
    assert (kept["preview"], kept["updatedAt"], kept["createdAt"]) == (
        "asked on the web",
        20,
        0,
    )


async def test_an_older_copy_of_a_thread_changes_nothing_of_it():
    threads = store()
    await threads.keep(
        ADA, sent(thread("t", preview="later", updated_at=20, agentContextId="c"))
    )
    await threads.keep(ADA, sent(thread("t", preview="earlier", updated_at=10)))

    kept = (await everything(threads, ADA))["threads"]["t"]

    assert (kept["preview"], kept["updatedAt"], kept["agentContextId"]) == (
        "later",
        20,
        "c",
    )


async def test_a_conversation_started_offline_gains_its_context_when_sent_later():
    threads = store()
    await threads.keep(ADA, sent(thread("t", messages=[message("m1", 10)])))
    await threads.keep(ADA, sent(thread("t", agentContextId="c", updated_at=10)))

    assert (await everything(threads, ADA))["threads"]["t"]["agentContextId"] == "c"


async def test_a_device_reads_only_what_changed_since_it_last_read():
    threads = store()
    await threads.keep(
        ADA,
        sent(
            thread("t", messages=[message("m1", 10)]),
            thread("g", scope=GENERAL, messages=[message("m2", 11)]),
        ),
    )
    read = await everything(threads, ADA)
    await threads.keep(ADA, sent(thread("t", messages=[message("m3", 30)])))

    later = await everything(threads, ADA, since=read["upTo"])

    assert list(later["threads"]) == ["t"]
    assert [m["id"] for m in later["threads"]["t"]["messages"]] == ["m3"]
    nothing = await everything(threads, ADA, since=later["upTo"])
    assert nothing["threads"] == {}


async def test_a_long_history_is_read_in_pages_each_message_once():
    threads = store()
    total = PAGE * 2 + 7
    for start in range(0, total, MAX_SENT_MESSAGES):
        batch = [
            message(f"m{n:04d}", n)
            for n in range(start, min(total, start + MAX_SENT_MESSAGES))
        ]
        await threads.keep(ADA, sent(thread("t", messages=batch)))

    read = await everything(threads, ADA)

    assert read["pages"] == 3
    ids = [m["id"] for m in read["threads"]["t"]["messages"]]
    assert ids == [f"m{n:04d}" for n in range(total)]


async def test_a_page_read_while_a_device_writes_stays_below_its_up_to():
    threads = store()
    await threads.keep(
        ADA,
        sent(thread("t", messages=[message(f"m{n:03d}", n) for n in range(PAGE + 1)])),
    )
    first = await threads.changes(ADA, 0, None, None)
    await threads.keep(ADA, sent(thread("t", messages=[message("late", 999)])))

    second = await threads.changes(ADA, 0, first.up_to, first.next)

    assert [m.id for m in second.threads[0].messages] == [f"m{PAGE:03d}"]
    assert second.next is None
    after = await everything(threads, ADA, since=first.up_to)
    assert [m["id"] for m in after["threads"]["t"]["messages"]] == ["late"]


async def test_a_later_edit_of_a_message_wins_and_an_earlier_one_does_not():
    threads = store()
    answered = {"card": CARD, "viewCalls": [{"method": "tools/call"}]}
    await threads.keep(
        ADA, sent(thread("t", messages=[message("m1", 10, type="system")]))
    )
    await threads.keep(
        ADA,
        sent(
            thread(
                "t",
                messages=[
                    message("m1", 10, type="system", editedAt=50, metadata=answered)
                ],
            )
        ),
    )
    await threads.keep(
        ADA,
        sent(thread("t", messages=[message("m1", 10, type="system", editedAt=20)])),
    )

    kept = (await everything(threads, ADA))["threads"]["t"]["messages"]

    assert [(m["editedAt"], m["metadata"]) for m in kept] == [(50, answered)]


async def test_a_threads_oldest_messages_go_past_its_limit(monkeypatch):
    monkeypatch.setattr(thread_store, "MAX_MESSAGES", 3)
    threads = store()
    await threads.keep(
        ADA,
        sent(
            thread("t", messages=[message(f"m{n}", n) for n in range(5)]),
            thread("g", scope=GENERAL, messages=[message("g1", 1)]),
        ),
    )

    read = (await everything(threads, ADA))["threads"]

    assert [m["id"] for m in read["t"]["messages"]] == ["m2", "m3", "m4"]
    assert [m["id"] for m in read["g"]["messages"]] == ["g1"]


async def test_the_oldest_threads_go_past_a_learners_limit(monkeypatch):
    monkeypatch.setattr(thread_store, "MAX_THREADS", 2)
    threads = store()
    for n, topic in enumerate(["A", "B", "C"]):
        scope = {**FRACTIONS, "topic": topic}
        await threads.keep(
            ADA,
            sent(
                thread(
                    f"t{topic}", scope=scope, updated_at=n, messages=[message(topic, n)]
                )
            ),
        )

    read = (await everything(threads, ADA))["threads"]

    assert sorted(read) == ["tB", "tC"]


async def test_a_thread_whose_id_names_another_conversation_is_not_kept():
    threads = store()
    await threads.keep(ADA, sent(thread("t", messages=[message("m1", 1)])))
    await threads.keep(
        ADA, sent(thread("t", scope=GENERAL, messages=[message("m2", 2)]))
    )

    read = (await everything(threads, ADA))["threads"]

    assert list(read) == ["t"]
    assert read["t"]["scope"] == FRACTIONS
    assert [m["id"] for m in read["t"]["messages"]] == ["m1"]


async def test_one_learners_threads_are_never_anothers():
    threads = store()
    await threads.keep(ADA, sent(thread("t", messages=[message("m-ada", 1)])))
    await threads.keep(GRACE, sent(thread("t", messages=[message("m-grace", 2)])))

    ada = (await everything(threads, ADA))["threads"]["t"]["messages"]
    grace = (await everything(threads, GRACE))["threads"]["t"]["messages"]

    assert [m["id"] for m in ada] == ["m-ada"]
    assert [m["id"] for m in grace] == ["m-grace"]


async def test_forgetting_a_learner_forgets_only_their_threads():
    threads = store()
    await threads.keep(ADA, sent(thread("t", messages=[message("m-ada", 1)])))
    await threads.keep(GRACE, sent(thread("t", messages=[message("m-grace", 2)])))

    await threads.forget(ADA)

    assert await everything(threads, ADA) == {"upTo": 0, "threads": {}, "pages": 1}
    assert list((await everything(threads, GRACE))["threads"]) == ["t"]


async def test_what_a_device_cannot_have_meant_is_left_out_and_the_rest_kept():
    threads = store()
    await threads.keep(
        ADA,
        sent(
            thread(
                "t",
                messages=[
                    message("m1", 1),
                    message("m2", 2, type="error"),
                    {"id": "no timestamp", "type": "user", "content": "x"},
                ],
            ),
            thread("x", scope={"kind": "lesson", "planId": "plan-1"}),
        ),
    )

    read = (await everything(threads, ADA))["threads"]

    assert list(read) == ["t"]
    assert [m["id"] for m in read["t"]["messages"]] == ["m1"]


async def test_too_long_a_message_is_cut_and_too_large_a_card_left_out():
    threads = store()
    huge = {"card": {"text": "x" * MAX_METADATA_CHARS}}
    await threads.keep(
        ADA,
        sent(
            thread(
                "t",
                messages=[
                    message(
                        "m1", 1, "y" * (MAX_CONTENT + 10), type="system", metadata=huge
                    )
                ],
            )
        ),
    )

    kept = (await everything(threads, ADA))["threads"]["t"]["messages"][0]

    assert len(kept["content"]) == MAX_CONTENT
    assert kept["metadata"] is None


async def test_a_device_holding_two_copies_of_a_conversation_sends_them_as_one():
    threads = store()
    await threads.keep(
        ADA,
        sent(
            thread("t1", messages=[message("m1", 1)], preview="first", updated_at=1),
            thread("t2", messages=[message("m2", 2)], preview="second", updated_at=2),
        ),
    )

    read = (await everything(threads, ADA))["threads"]

    assert len(read) == 1
    [kept] = read.values()
    assert kept["preview"] == "second"
    assert [m["id"] for m in kept["messages"]] == ["m1", "m2"]


async def test_a_cursor_the_store_never_gave_is_refused():
    with pytest.raises(BadCursor):
        await store().changes(ADA, 0, 1, "nonsense")


@pytest.fixture
def app(monkeypatch):
    """Google vouches for two accounts."""

    async def verified(id_token, _api_key, **_):
        accounts = {"good": UID, "other": "uid456"}
        if id_token not in accounts:
            raise firebase.InvalidSignIn("The sign-in is not valid. Sign in again.")
        return firebase.SignedIn(uid=accounts[id_token], name="Ada")

    monkeypatch.setattr("app.api.routes.verified", verified)
    return create_app(
        Settings(
            aws_bearer_token_bedrock="bedrock-test",
            session_secret="s",
            firebase_api_key="key",
            _env_file=None,
        ),
        learners=InMemoryLearnerStore(),
    )


async def learning_as(http, name: str, token: str = "good") -> dict:
    await signed_in(http, firebaseIdToken=token)
    return await chosen(http, await added(http, name))


async def pushed(http, *threads: dict):
    return await http.post("/api/learner/threads", json={"threads": list(threads)})


async def read_all(http, since: int = 0) -> dict:
    first = (await http.get("/api/learner/threads", params={"since": since})).json()
    page, threads = first, list(first["threads"])
    while page["next"]:
        page = (
            await http.get(
                "/api/learner/threads",
                params={"since": since, "upTo": first["upTo"], "after": page["next"]},
            )
        ).json()
        threads += page["threads"]
    return {"upTo": first["upTo"], "threads": threads}


async def test_a_thread_started_on_the_phone_opens_on_the_web_and_back(app):
    async with client(app) as phone, client(app) as web:
        ada = await learning_as(phone, "Ada")
        await signed_in(web, firebaseIdToken="good")
        await chosen(web, ada["learner"]["id"])

        kept = await pushed(
            phone,
            thread(
                "thread-phone",
                messages=[
                    message("m1", 1, "What is a fraction?"),
                    message("m2", 2, type="system"),
                ],
                agentContextId="context-1",
            ),
        )
        on_web = await read_all(web)
        await pushed(
            web, thread("thread-web", messages=[message("m3", 3, "And a decimal?")])
        )
        on_phone = await read_all(phone, since=on_web["upTo"])

    assert kept.status_code == 200 and kept.json() == {"seq": 1}
    [shared] = on_web["threads"]
    assert (shared["id"], shared["agentContextId"]) == ("thread-phone", "context-1")
    assert [m["content"] for m in shared["messages"]] == [
        "What is a fraction?",
        "message m2",
    ]
    [back] = on_phone["threads"]
    assert back["id"] == "thread-phone"
    assert [m["id"] for m in back["messages"]] == ["m3"]


async def test_a_device_signed_out_keeps_its_threads_to_itself(app):
    async with client(app) as http:
        await signed_in(http, deviceId=DEVICE)
        sent_ = await pushed(http, thread("t"))
        read = await http.get("/api/learner/threads")

    assert (sent_.status_code, read.status_code) == (403, 403)
    assert read.json()["detail"]["code"] == "account_required"


async def test_an_account_with_no_learner_chosen_keeps_no_threads(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        read = await http.get("/api/learner/threads")

    assert read.status_code == 409
    assert read.json()["detail"]["code"] == "learner_required"


async def test_no_other_learner_or_account_reads_a_learners_threads(app):
    async with client(app) as http:
        await learning_as(http, "Ada")
        await pushed(http, thread("t", messages=[message("secret", 1)]))

        grace = await learning_as(http, "Grace")
        as_grace = await read_all(http)
        await learning_as(http, "Ada", token="other")
        as_other = await read_all(http)

    assert grace["learner"]["name"] == "Grace"
    assert as_grace["threads"] == [] and as_other["threads"] == []


async def test_a_removed_learners_threads_are_forgotten_and_none_kept_after(app):
    async with client(app) as http:
        ada = await learning_as(http, "Ada")
        await pushed(http, thread("t", messages=[message("m1", 1)]))
        removed = await http.delete(f"/api/account/learners/{ada['learner']['id']}")
        late = await pushed(http, thread("t", messages=[message("m2", 2)]))
        read = await read_all(http)

    assert removed.status_code == 200
    assert late.status_code == 404
    assert read["threads"] == []


async def test_too_much_at_once_is_refused(app, monkeypatch):
    monkeypatch.setattr("app.api.thread_routes.MAX_SENT_CHARS", 1000)
    async with client(app) as http:
        await learning_as(http, "Ada")
        too_large = await http.post(
            "/api/learner/threads",
            content=b'{"threads": []}' + b" " * 1000,
            headers={"Content-Type": "application/json"},
        )
        bad_cursor = await http.get(
            "/api/learner/threads", params={"since": 0, "upTo": 1, "after": "x"}
        )

    assert too_large.status_code == 413
    assert bad_cursor.status_code == 422


async def test_more_messages_than_a_request_carries_are_refused(app):
    async with client(app) as http:
        await learning_as(http, "Ada")
        refused = await pushed(
            http,
            thread(
                "t", messages=[message(f"m{n}", n) for n in range(MAX_SENT_MESSAGES)]
            ),
            thread("g", scope=GENERAL, messages=[message("one-more", 1)]),
        )

    assert refused.status_code == 422

"""An account holds learners: each has a record and a plan of their own, a
device learns as one of them, and removing a learner or the account forgets
everything kept for them."""

import pytest
from lesson_example import LESSON
from pydantic import ValidationError
from signed_in import DEVICE, UID, added, chosen, client, signed_in, signed_in_app

from app.account.directory import (
    MAX_LEARNERS,
    Directory,
    LearnerAdded,
    LearnerRemoved,
    LearnerRenamed,
    account_key,
    applied,
    learner_key,
    new_learner,
)
from app.learner.plan import Plan
from app.learner.record import (
    Conversed,
    Learnt,
    LessonKept,
    TopicRef,
    changed,
    serialised,
)

TOPIC = TopicRef(
    plan_id="p", subject_slug="mathematics", topic_index=0, topic="Fractions"
)


@pytest.fixture
def app(monkeypatch):
    return signed_in_app(monkeypatch)


def plan(plan_id: str, grade: str = "JSS 1") -> str:
    return Plan.model_validate(
        {
            "planId": plan_id,
            "updatedAt": 1,
            "gradeLevel": grade,
            "subjects": [{"name": "Mathematics", "slug": "mathematics"}],
        }
    ).json()


def directory_after(*changes) -> Directory:
    directory = Directory()
    for change in changes:
        directory = applied(directory, change)
    return directory


def test_a_list_takes_learners_up_to_its_limit_once_each():
    learners = [new_learner(f"Child {n}", n) for n in range(MAX_LEARNERS + 1)]

    listed = directory_after(
        *(LearnerAdded(learner=one) for one in learners),
        LearnerAdded(learner=learners[0]),
    )

    assert [one.name for one in listed.learners] == [
        f"Child {n}" for n in range(MAX_LEARNERS)
    ]


def test_a_learner_is_renamed_and_removed_by_id():
    ada, grace = new_learner("Ada", 1), new_learner("Grace", 2)

    listed = directory_after(
        LearnerAdded(learner=ada),
        LearnerAdded(learner=grace),
        LearnerRenamed(id=ada.id, name="  Ada   L. "),
        LearnerRemoved(id=grace.id),
    )

    assert [(one.id, one.name) for one in listed.learners] == [(ada.id, "Ada L.")]


@pytest.mark.parametrize("name", ["", "   ", "x" * 41])
def test_a_learners_name_is_one_to_forty_characters(name):
    with pytest.raises(ValidationError):
        new_learner(name, 1)


async def test_a_learner_is_added_only_by_their_parent_guardian_or_themselves(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        unconfirmed = await http.post("/api/account/learners", json={"name": "Ada"})
        confirmed = await http.post(
            "/api/account/learners", json={"name": "Ada", "guardian": True}
        )
        listed = (await http.get("/api/account/learners")).json()

    assert (unconfirmed.status_code, confirmed.status_code) == (422, 201)
    assert [one["name"] for one in listed["learners"]] == ["Ada"]


async def test_only_a_signed_in_session_manages_learners(app):
    async with client(app) as http:
        await signed_in(http, deviceId=DEVICE)
        listed = await http.get("/api/account/learners")

    assert listed.status_code == 403
    assert listed.json()["detail"]["code"] == "account_required"


async def test_an_account_takes_no_more_learners_than_its_limit(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        for n in range(MAX_LEARNERS):
            await added(http, f"Child {n}")
        refused = await http.post(
            "/api/account/learners", json={"name": "One more", "guardian": True}
        )

    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "too_many_learners"


async def test_learners_of_one_account_keep_their_plans_apart(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        ada, grace = await added(http, "Ada"), await added(http, "Grace")
        account = dict(http.headers)
        await chosen(http, ada)
        await http.put("/api/learner/curriculum", content=plan("plan-ada"))
        http.headers.update(account)
        await chosen(http, grace)
        graces = (await http.get("/api/learner/curriculum")).json()

    assert graces["plan"] is None


async def test_a_device_names_its_learner_when_it_signs_in_again(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        ada = await added(http, "Ada")
        again = await signed_in(http, firebaseIdToken="good", learnerId=ada)
        await http.put("/api/learner/curriculum", content=plan("plan-ada"))
        kept = await app.state.keeping.learners.plan(learner_key(UID, ada))

    assert again["learner"]["name"] == "Ada"
    assert '"planId":"plan-ada"' in kept


async def test_a_device_whose_learner_was_removed_signs_in_to_the_account(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        ada = await added(http, "Ada")
        await http.delete(f"/api/account/learners/{ada}")
        again = await signed_in(http, firebaseIdToken="good", learnerId=ada)
        chosen_again = await http.post(f"/api/account/learners/{ada}/session")

    assert (again["signedIn"], again["learner"]) == (True, None)
    assert chosen_again.status_code == 404


async def test_an_account_from_before_learners_becomes_its_first_learner(app):
    learners = app.state.keeping.learners
    await learners.keep_plan(account_key(UID), plan("plan-old"))
    await learners.change(account_key(UID), Learnt(topic=TOPIC, at=7))

    async with client(app) as http:
        first = await signed_in(http, firebaseIdToken="good")
        await signed_in(http, firebaseIdToken="good")
        listed = (await http.get("/api/account/learners")).json()["learners"]
        await chosen(http, listed[0]["id"])
        kept = (await http.get("/api/learner/curriculum")).json()
        record = (await http.get("/api/learner", params={"planId": "p"})).json()

    assert first["learner"] is None
    assert [one["name"] for one in listed] == ["Ada"]
    assert kept["plan"]["planId"] == "plan-old"
    assert [t["learntAt"] for t in record["topics"]] == [7]
    assert await learners.plan(account_key(UID)) is None


async def _learnt_and_talked(app, learner_id: str) -> None:
    keeping = app.state.keeping
    key = learner_key(UID, learner_id)
    await keeping.lessons.keep("lesson-1", LESSON)
    await keeping.conversations.append("talk-1", {"user": "Hi", "assistant": "Hello"})
    await keeping.learners.keep_plan(key, plan("plan-ada"))
    for change in (
        LessonKept(topic=TOPIC, lesson_id="lesson-1"),
        Conversed(conversation_id="talk-1"),
    ):
        await keeping.learners.change(key, change)


async def _forgotten(app, learner_id: str) -> bool:
    keeping = app.state.keeping
    key = learner_key(UID, learner_id)
    return (
        await keeping.learners.plan(key) is None
        and not (await keeping.learners.load(key)).topics
        and await keeping.lessons.find("lesson-1") is None
        and not (await keeping.conversations.load("talk-1")).exchanges
    )


async def test_removing_a_learner_forgets_everything_kept_for_them(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        ada, grace = await added(http, "Ada"), await added(http, "Grace")
        await _learnt_and_talked(app, ada)
        left = (await http.delete(f"/api/account/learners/{ada}")).json()

    assert [one["id"] for one in left["learners"]] == [grace]
    assert await _forgotten(app, ada)


async def test_deleting_the_account_forgets_every_learner(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        ada = await added(http, "Ada")
        await _learnt_and_talked(app, ada)
        deleted = await http.delete("/api/account")
        listed = (await http.get("/api/account/learners")).json()

    assert deleted.status_code == 204
    assert listed["learners"] == []
    assert await _forgotten(app, ada)


def test_a_conversation_is_held_once():
    stored = None
    for _ in range(2):
        stored = changed(stored, serialised(Conversed(conversation_id="talk-1")))

    assert '"conversations":["talk-1"]' in stored

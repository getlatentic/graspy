"""Signing in: Google vouches for the account, a learner takes in each
device's record once, and the learner's devices share one plan."""

import httpx
import pytest
from signed_in import DEVICE, UID, as_learner, client, signed_in, signed_in_app

from app.learner.plan import Plan, joined
from app.learner.record import (
    Answer,
    Answered,
    DeviceJoined,
    LearnerRecord,
    Learnt,
    PlanMerged,
    TopicMark,
    TopicRef,
    changed,
    parsed,
    serialised,
)
from app.security import firebase
from app.settings import Settings


def fractions(plan="plan-device", index=1) -> TopicRef:
    return TopicRef(
        plan_id=plan, subject_slug="mathematics", topic_index=index, topic="Fractions"
    )


def answer(key="q1", at=1, plan="plan-device") -> Answer:
    return Answer(
        plan_id=plan,
        subject_slug="mathematics",
        topic="Fractions",
        key=key,
        source="practice",
        question="1/2 + 1/4?",
        correct=True,
        at=at,
    )


def after(*changes) -> LearnerRecord:
    stored = None
    for change in changes:
        stored = changed(stored, serialised(change))
    return parsed(stored)


def plan(plan_id, updated_at, subjects: dict[str, list[str]], grade="JSS 1") -> Plan:
    return Plan.model_validate(
        {
            "planId": plan_id,
            "updatedAt": updated_at,
            "country": "Nigeria",
            "language": "English",
            "gradeLevel": grade,
            "subjects": [{"name": slug.title(), "slug": slug} for slug in subjects],
            "topics": subjects,
        }
    )


def test_a_device_is_taken_in_once_under_what_the_account_has():
    joining = DeviceJoined(
        device=DEVICE,
        topics=[TopicMark(**fractions().model_dump(), learnt_at=5)],
        answers=[answer()],
    )

    record = after(Answered(answer=answer(at=9)), joining, joining)

    assert record.joined == [DEVICE]
    assert [a.at for a in record.answers] == [9]
    assert record.mark(fractions()).learnt_at == 5


def test_a_merged_plan_moves_its_topics_by_name_to_their_new_place():
    record = after(
        Learnt(topic=fractions(index=1), at=5),
        Answered(answer=answer()),
        PlanMerged(
            from_plan="plan-device",
            to_plan="plan-account",
            topics={"mathematics": {"Fractions": 3}},
        ),
    )

    moved = record.mark(fractions(plan="plan-account", index=3))
    assert moved is not None and moved.learnt_at == 5
    assert record.in_plan("plan-account").answers[0].topic == "Fractions"


def test_joining_keeps_the_accounts_subjects_and_adds_the_devices_others():
    account = plan("plan-account", 10, {"mathematics": ["Decimals", "Fractions"]})
    device = plan(
        "plan-device",
        20,
        {"mathematics": ["Fractions"], "biology": ["Cells"]},
    )

    result = joined(account, device, now=30)

    assert [s.slug for s in result.plan.subjects] == ["mathematics", "biology"]
    assert result.plan.topics["mathematics"] == ["Decimals", "Fractions"]
    assert result.plan.updated_at == 30
    assert result.plan.model_dump(by_alias=True)["gradeLevel"] == "JSS 1"
    assert result.carried.topics == {
        "mathematics": {"Fractions": 1},
        "biology": {"Cells": 0},
    }


@pytest.mark.parametrize(
    ("account_updated", "expected"),
    [(10, "device"), (50, "account")],
    ids=["device-newer", "account-newer"],
)
def test_plans_for_different_classes_do_not_mix_and_the_newer_wins(
    account_updated, expected
):
    account = plan("plan-account", account_updated, {"maths": ["Algebra"]}, "SS 1")
    device = plan("plan-device", 20, {"maths": ["Counting"], "art": ["Colour"]})

    result = joined(account, device, now=99)

    assert result.carried is None
    assert result.plan == (device if expected == "device" else account)


@pytest.mark.parametrize(
    ("account", "expected"),
    [
        (None, "device"),
        (plan("same", 5, {}), "device"),
        (plan("same", 50, {}), "account"),
    ],
    ids=["no-account-plan", "device-newer", "account-newer"],
)
def test_one_plan_between_account_and_device_is_the_newer(account, expected):
    device = plan("same", 20, {})

    result = joined(account, device, now=99)

    assert result.carried is None
    assert result.plan == (device if expected == "device" else account)


def google(status: int, body: dict) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(status, json=body)
        )
    )


async def test_google_names_the_account_of_a_valid_token():
    signed = await firebase.verified(
        "token",
        "key",
        google(200, {"users": [{"localId": UID, "displayName": "Ada Lovelace"}]}),
    )

    assert signed == firebase.SignedIn(uid=UID, name="Ada Lovelace")


@pytest.mark.parametrize(
    ("status", "body"),
    [(400, {"error": {"message": "INVALID_ID_TOKEN"}}), (200, {"users": []})],
    ids=["refused", "no-user"],
)
async def test_a_token_google_does_not_vouch_for_is_refused(status, body):
    with pytest.raises(firebase.InvalidSignIn):
        await firebase.verified("token", "key", google(status, body))


def unreachable_google() -> httpx.AsyncClient:
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route to Google", request=request)

    return httpx.AsyncClient(transport=httpx.MockTransport(fail))


@pytest.mark.parametrize(
    "google_client",
    [
        unreachable_google,
        lambda: google(500, {}),
        lambda: google(503, {}),
        lambda: google(429, {"error": {"message": "QUOTA_EXCEEDED"}}),
    ],
    ids=["unreachable", "failed", "unavailable", "too-many-requests"],
)
async def test_a_token_google_could_not_check_may_pass_later(google_client):
    with pytest.raises(firebase.SignInUnchecked):
        await firebase.verified("token", "key", google_client())


async def test_the_auth_emulator_is_asked_in_place_of_google():
    asked = []

    def answer(request: httpx.Request) -> httpx.Response:
        asked.append(str(request.url.copy_with(query=None)))
        return httpx.Response(200, json={"users": [{"localId": UID}]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(answer))
    await firebase.verified(
        "token", "key", client, url=firebase.lookup_url("127.0.0.1:9099")
    )

    assert asked == [
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup"
    ]
    assert firebase.lookup_url(None) == firebase.LOOKUP_URL


def test_production_refuses_the_auth_emulator():
    with pytest.raises(ValueError, match="FIREBASE_AUTH_EMULATOR_HOST"):
        Settings(
            app_env="production",
            firebase_auth_emulator_host="127.0.0.1:9099",
            _env_file=None,
        )


@pytest.fixture
def app(monkeypatch):
    return signed_in_app(monkeypatch)


async def test_the_first_choice_of_a_learner_brings_the_devices_record(app):
    async with client(app) as http:
        app.state.keeping.learners._stored[DEVICE] = changed(
            None, serialised(Learnt(topic=fractions(plan="p"), at=7))
        )

        await as_learner(http)
        record = (await http.get("/api/learner", params={"planId": "p"})).json()

    assert [t["learntAt"] for t in record["topics"]] == [7]
    assert "joined" not in record
    assert "conversations" not in record


async def test_an_account_session_reads_no_learners_record(app):
    async with client(app) as http:
        session = await signed_in(http, deviceId=DEVICE, firebaseIdToken="good")
        record = await http.get("/api/learner", params={"planId": "p"})
        plan_read = await http.get("/api/learner/curriculum")

    assert (session["signedIn"], session["learner"]) == (True, None)
    assert (record.status_code, plan_read.status_code) == (409, 409)
    assert record.json()["detail"]["code"] == "learner_required"


@pytest.mark.parametrize(
    ("key", "status", "code"),
    [("key", 401, "sign_in_invalid"), (None, 503, "sign_in_off")],
    ids=["bad-token", "sign-in-off"],
)
async def test_a_sign_in_that_cannot_be_trusted_is_refused(app, key, status, code):
    app.state.settings = app.state.settings.model_copy(update={"firebase_api_key": key})
    async with client(app) as http:
        response = await http.post(
            "/api/session", json={"deviceId": DEVICE, "firebaseIdToken": "bad"}
        )

    assert response.status_code == status
    assert response.json()["detail"]["code"] == code


async def test_a_sign_in_google_could_not_check_is_a_temporary_failure(app):
    async with client(app) as http:
        response = await http.post(
            "/api/session", json={"deviceId": DEVICE, "firebaseIdToken": "unchecked"}
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "sign_in_unchecked"


async def test_devices_share_the_newer_plan_and_a_stale_one_gets_it_back(app):
    newer, older = plan("p", 20, {"maths": ["A"]}), plan("p", 10, {"maths": ["B"]})
    async with client(app) as http:
        await as_learner(http)
        await http.put("/api/learner/curriculum", content=newer.json())
        answered = await http.put("/api/learner/curriculum", content=older.json())
        shared = (await http.get("/api/learner/curriculum")).json()

    assert answered.json()["plan"]["topics"] == {"maths": ["A"]}
    assert shared["plan"]["updatedAt"] == 20


async def test_a_plan_with_no_subjects_is_shared_with_its_class(app):
    """A nursery class learns by voice alone: its plan names the class and no subjects."""
    nursery = Plan.model_validate(
        {
            "planId": "plan-nursery",
            "updatedAt": 5,
            "gradeLevel": "Nursery 1 (Early childhood), Nigeria, age 3",
            "system": "NG",
            "level": "nursery-1",
            "subjects": [],
        }
    )
    async with client(app) as http:
        await as_learner(http)
        kept = await http.put("/api/learner/curriculum", content=nursery.json())
        joined_plan = await http.post(
            "/api/learner/curriculum/join", content=nursery.json()
        )
        shared = (await http.get("/api/learner/curriculum")).json()["plan"]

    assert (kept.status_code, joined_plan.status_code) == (200, 200)
    assert (shared["subjects"], shared["system"], shared["level"]) == (
        [],
        "NG",
        "nursery-1",
    )


async def test_joining_merges_the_plans_and_moves_the_devices_progress(app):
    account = plan("plan-account", 10, {"mathematics": ["Decimals", "Fractions"]})
    device = plan("plan-device", 20, {"mathematics": ["Fractions"]})
    async with client(app) as http:
        learner = await as_learner(http)
        await http.put("/api/learner/curriculum", content=account.json())
        await http.post(
            "/api/learner/plan", json={"kind": "plan_kept", "planId": "plan-device"}
        )
        app.state.keeping.learners._stored[f"account:{UID}/{learner}"] = changed(
            None, serialised(Learnt(topic=fractions(index=0), at=7))
        )

        merged = (
            await http.post("/api/learner/curriculum/join", content=device.json())
        ).json()["plan"]
        record = (
            await http.get("/api/learner", params={"planId": "plan-account"})
        ).json()

    assert merged["planId"] == "plan-account"
    assert [(t["topicIndex"], t["learntAt"]) for t in record["topics"]] == [(1, 7)]


async def test_a_plan_too_large_or_malformed_is_refused(app):
    async with client(app) as http:
        await signed_in(http, deviceId=DEVICE)
        too_large = await http.put("/api/learner/curriculum", content=b"x" * 1_000_001)
        malformed = await http.put("/api/learner/curriculum", content=b"{}")

    assert (too_large.status_code, malformed.status_code) == (413, 422)

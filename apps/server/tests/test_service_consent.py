"""A parent's consent to use graspy for a learner, sent with the learner when they are added. Sent
without it, a learner is added as before and nothing is recorded; a consent that does not hold adds
no learner."""

import time

import pytest
from consent_sign_ins import consent_app
from signed_in import UID, client, signed_in, signed_in_app
from voice_worker import worker_env

SERVICE_NOTICE = 1


@pytest.fixture
def env():
    return worker_env()


@pytest.fixture
def app(monkeypatch, env):
    return consent_app(monkeypatch, env)


def adding(name: str = "Ada", **consent) -> dict:
    body = {"name": name, "guardian": True}
    if consent:
        body["consent"] = {"noticeVersion": SERVICE_NOTICE, **consent}
    return body


async def learners(http) -> list[dict]:
    return (await http.get("/api/account/learners")).json()["learners"]


async def test_a_learner_added_with_a_fresh_sign_in_has_the_parents_consent_recorded(
    app, env
):
    before = int(time.time() * 1000)
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        added = await http.post(
            "/api/account/learners", json=adding(firebaseIdToken="fresh")
        )
        listed = await learners(http)

    assert added.status_code == 201
    body = added.json()
    assert body["name"] == "Ada" and body["voiceConsent"] is None
    consent = body["serviceConsent"]
    assert consent["noticeVersion"] == 1
    assert before <= consent["grantedAt"] <= int(time.time() * 1000)
    assert listed[0]["serviceConsent"] == consent
    assert env.DB.rows("SELECT * FROM consents") == [
        {
            "id": 1,
            "learner_key": f"account:{UID}/{body['id']}",
            "account_uid": UID,
            "scope": "service",
            "notice_version": 1,
            "retention_days": None,
            "granted_at": consent["grantedAt"],
            "revoked_at": None,
        }
    ]


async def test_a_learner_added_the_old_way_is_added_and_nothing_is_recorded(app, env):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        added = await http.post(
            "/api/account/learners", json={"name": "Ada", "guardian": True}
        )
        listed = await learners(http)

    assert added.status_code == 201
    assert added.json()["serviceConsent"] is None
    assert listed[0]["serviceConsent"] is None and listed[0]["voiceConsent"] is None
    assert env.DB.rows("SELECT * FROM consents") == []


async def test_a_learner_added_the_old_way_without_the_workers_bindings_is_added(
    monkeypatch,
):
    async with client(signed_in_app(monkeypatch)) as http:
        await signed_in(http, firebaseIdToken="good")
        added = await http.post(
            "/api/account/learners", json={"name": "Ada", "guardian": True}
        )
        listed = await learners(http)

    assert added.status_code == 201
    assert [one["serviceConsent"] for one in listed] == [None]


@pytest.mark.parametrize(
    ("consent", "status", "code"),
    [
        ({"firebaseIdToken": "stale"}, 401, "sign_in_stale"),
        ({"firebaseIdToken": "undated"}, 401, "sign_in_stale"),
        ({"firebaseIdToken": "other"}, 403, "sign_in_other_account"),
        ({"firebaseIdToken": "password"}, 403, "sign_in_not_google"),
        ({"firebaseIdToken": "forged"}, 401, "sign_in_invalid"),
    ],
)
async def test_a_consent_whose_sign_in_does_not_hold_adds_no_learner(
    app, env, consent, status, code
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        refused = await http.post("/api/account/learners", json=adding(**consent))
        listed = await learners(http)

    assert refused.status_code == status
    assert refused.json()["detail"]["code"] == code
    assert listed == []
    assert env.DB.rows("SELECT * FROM consents") == []


async def test_a_notice_graspy_does_not_show_adds_no_learner(app, env):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        refused = await http.post(
            "/api/account/learners",
            json={
                "name": "Ada",
                "guardian": True,
                "consent": {"noticeVersion": 2, "firebaseIdToken": "fresh"},
            },
        )
        listed = await learners(http)

    assert refused.status_code == 400
    assert refused.json()["detail"]["code"] == "notice_unknown"
    assert listed == []


async def test_a_consent_where_none_can_be_kept_adds_no_learner(monkeypatch):
    async with client(signed_in_app(monkeypatch)) as http:
        await signed_in(http, firebaseIdToken="good")
        refused = await http.post(
            "/api/account/learners", json=adding(firebaseIdToken="good")
        )
        listed = await learners(http)

    assert refused.status_code == 503
    assert refused.json()["detail"]["code"] == "consent_unavailable"
    assert listed == []


async def test_a_learner_must_still_be_added_by_their_guardian(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        refused = await http.post(
            "/api/account/learners",
            json={
                "name": "Ada",
                "consent": {"noticeVersion": 1, "firebaseIdToken": "fresh"},
            },
        )

    assert refused.status_code == 422


async def test_the_two_consents_are_kept_apart(app, env):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = (
            await http.post(
                "/api/account/learners", json=adding(firebaseIdToken="fresh")
            )
        ).json()["id"]
        await http.put(
            f"/api/account/learners/{learner}/voice/consent",
            json={"noticeVersion": 1, "retentionDays": 90, "firebaseIdToken": "fresh"},
        )
        both = (await learners(http))[0]
        await http.delete(f"/api/account/learners/{learner}/voice/consent")
        only_service = (await learners(http))[0]

    assert both["serviceConsent"]["noticeVersion"] == 1
    assert both["voiceConsent"] == {"noticeVersion": 1, "retentionDays": 90}
    assert only_service["voiceConsent"] is None
    assert only_service["serviceConsent"] == both["serviceConsent"]
    assert sorted(
        (row["scope"], row["revoked_at"] is None)
        for row in env.DB.rows("SELECT * FROM consents")
    ) == [("recordings", False), ("service", True)]


async def test_removing_a_learner_forgets_their_consent(app, env):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        first = (
            await http.post(
                "/api/account/learners", json=adding(firebaseIdToken="fresh")
            )
        ).json()["id"]
        second = (
            await http.post(
                "/api/account/learners", json=adding("Bo", firebaseIdToken="fresh")
            )
        ).json()["id"]
        await http.delete(f"/api/account/learners/{first}")

    assert [row["learner_key"] for row in env.DB.rows("SELECT * FROM consents")] == [
        f"account:{UID}/{second}"
    ]


async def test_a_consent_that_cannot_be_kept_leaves_no_learner_and_a_retry_adds_one(
    app, env, monkeypatch
):
    batch = env.DB.batch

    async def broken(statements):
        raise RuntimeError("D1 is down")

    monkeypatch.setattr(env.DB, "batch", broken)
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        failed = await http.post(
            "/api/account/learners", json=adding(firebaseIdToken="fresh")
        )
        after_failure = await learners(http)
        monkeypatch.setattr(env.DB, "batch", batch)
        retried = await http.post(
            "/api/account/learners", json=adding(firebaseIdToken="fresh")
        )
        after_retry = await learners(http)

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "consent_not_kept"
    assert after_failure == []
    assert retried.status_code == 201
    assert [one["id"] for one in after_retry] == [retried.json()["id"]]
    assert [row["learner_key"] for row in env.DB.rows("SELECT * FROM consents")] == [
        f"account:{UID}/{retried.json()['id']}"
    ]

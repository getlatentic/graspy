"""A consent never outlives its learner: not when the learner is removed while the stores are being
forgotten, between the check and the write, or while a consent is being added with the learner, and
not when something other than the learner's absence is what fails."""

import pytest
from consent_sign_ins import consent_app
from signed_in import UID, as_parent, client, signed_in
from voice_worker import worker_env

from app.account.directory import LearnerRemoved, account_key
from app.account.learners import FORGET_TRIES, removed
from app.api import account_routes as routes_of_accounts
from app.caller import Caller
from app.learner.record import LearnerRecord, Seen

CONSENT = {"noticeVersion": 1, "firebaseIdToken": "fresh"}
ADDING = {"name": "Ada", "guardian": True, "consent": CONSENT}


@pytest.fixture
def env():
    return worker_env()


@pytest.fixture
def app(monkeypatch, env):
    return consent_app(monkeypatch, env)


def consent_url(learner: str) -> str:
    return f"/api/account/learners/{learner}/consent"


def voice_consent_url(learner: str) -> str:
    return f"/api/account/learners/{learner}/voice/consent"


async def added_with_consent(http) -> str:
    created = await http.post("/api/account/learners", json=ADDING)
    assert created.status_code == 201
    return created.json()["id"]


async def added_without_consent(http) -> str:
    created = await http.post(
        "/api/account/learners", json={"name": "Ada", "guardian": True}
    )
    return created.json()["id"]


def consents(env) -> list[dict]:
    return env.DB.rows("SELECT * FROM consents")


async def directory_of(app):
    return (await app.state.keeping.learners.directory(account_key(UID))).learners


async def test_a_consent_sent_while_a_learner_is_being_forgotten_does_not_come_back(
    app, env, monkeypatch
):
    sent_during: list = []
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added_with_consent(http)
        forget = app.state.keeping.voice.forget

        async def forgetting(key):
            await forget(key)
            sent_during.append(await http.put(consent_url(learner), json=CONSENT))

        monkeypatch.setattr(app.state.keeping.voice, "forget", forgetting)
        removal = await http.delete(f"/api/account/learners/{learner}")

    assert removal.status_code == 200
    assert [reply.status_code for reply in sent_during] == [404]
    assert consents(env) == []


async def test_a_consent_written_and_checked_after_the_learner_left_the_directory_is_taken_back(
    app, env, monkeypatch
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added_without_consent(http)
        write = routes_of_accounts.grant_consent

        async def written_then_removed_from_the_directory(database, key, *rest):
            granted = await write(database, key, *rest)
            await app.state.keeping.learners.change_directory(
                account_key(UID), LearnerRemoved(id=learner)
            )
            return granted

        monkeypatch.setattr(
            "app.api.account_routes.grant_consent",
            written_then_removed_from_the_directory,
        )
        refused = await http.put(consent_url(learner), json=CONSENT)

    assert refused.status_code == 404
    assert consents(env) == []


async def test_a_learner_removed_after_it_was_added_and_before_its_consent_is_written_gets_none(
    app, env, monkeypatch
):
    write = routes_of_accounts.grant_consent

    async def after_a_removal_from_another_device(database, key, *rest):
        await app.state.keeping.learners.change_directory(
            account_key(UID), LearnerRemoved(id=key.rsplit("/", 1)[1])
        )
        return await write(database, key, *rest)

    monkeypatch.setattr(
        "app.api.account_routes.grant_consent", after_a_removal_from_another_device
    )
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        refused = await http.post("/api/account/learners", json=ADDING)

    assert refused.status_code == 404
    assert refused.json()["detail"]["code"] == "no_such_learner"
    assert consents(env) == []
    assert await directory_of(app) == []


async def test_a_consent_committed_though_d1_reported_failure_goes_with_the_undone_learner(
    app, env, monkeypatch
):
    batch = env.DB.batch

    async def committed_then_failed(statements):
        await batch(statements)
        raise RuntimeError("D1 lost the reply")

    monkeypatch.setattr(env.DB, "batch", committed_then_failed)
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        failed = await http.post("/api/account/learners", json=ADDING)

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "consent_not_kept"
    assert await directory_of(app) == []
    assert consents(env) == []


def second_look_fails(monkeypatch, broken: list[bool]):
    """The first look at the learner (the route's own) passes; the one after the write fails
    while `broken` holds."""
    looked = routes_of_accounts.learner_of
    calls: list[str] = []

    async def look(keeping, uid, learner_id):
        calls.append(learner_id)
        if len(calls) > 1 and broken:
            raise RuntimeError("the directory is down")
        return await looked(keeping, uid, learner_id)

    monkeypatch.setattr("app.api.account_routes.learner_of", look)


async def test_a_learner_that_cannot_be_checked_after_the_write_answers_503_and_a_resend_agrees(
    app, env, monkeypatch
):
    broken = [True]
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added_without_consent(http)
        second_look_fails(monkeypatch, broken)
        failed = await http.put(consent_url(learner), json=CONSENT)
        broken.clear()
        resent = await http.put(consent_url(learner), json=CONSENT)

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "consent_not_kept"
    assert resent.status_code == 200
    active = [row for row in consents(env) if row["revoked_at"] is None]
    assert [row["scope"] for row in active] == ["service"]


async def test_a_recordings_consent_for_a_learner_that_cannot_be_checked_answers_503_and_keeps_the_service_consent(
    app, env, monkeypatch
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added_with_consent(http)
        await as_parent(http)
        second_look_fails(monkeypatch, [True])
        failed = await http.put(
            voice_consent_url(learner), json={**CONSENT, "retentionDays": 30}
        )

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "consent_not_kept"
    active = [row["scope"] for row in consents(env) if row["revoked_at"] is None]
    assert "service" in active


async def test_a_consent_written_before_the_learner_was_forgotten_goes_with_them(
    app, env, monkeypatch
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added_without_consent(http)
        write = routes_of_accounts.grant_consent

        async def written_then_removed_in_full(database, key, *rest):
            granted = await write(database, key, *rest)
            await removed(app.state.keeping, UID, learner)
            return granted

        monkeypatch.setattr(
            "app.api.account_routes.grant_consent", written_then_removed_in_full
        )
        refused = await http.put(consent_url(learner), json=CONSENT)

    assert refused.status_code == 404
    assert consents(env) == []


async def test_a_consent_that_cannot_be_deleted_for_a_removed_learner_still_answers_404(
    app, env, monkeypatch
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added_without_consent(http)

        async def removed_during_write(database, key, *rest):
            await app.state.keeping.learners.change_directory(
                account_key(UID), LearnerRemoved(id=learner)
            )
            return await routes_of_accounts_write(database, key, *rest)

        async def cannot_delete(database, key):
            raise RuntimeError("D1 is down")

        routes_of_accounts_write = routes_of_accounts.grant_consent
        monkeypatch.setattr(
            "app.api.account_routes.grant_consent", removed_during_write
        )
        monkeypatch.setattr("app.api.account_routes.forget_consents", cannot_delete)
        refused = await http.put(consent_url(learner), json=CONSENT)

    assert refused.status_code == 404
    assert refused.json()["detail"]["code"] == "no_such_learner"


async def kept_for(app, learner: str):
    """A record for the learner, so there is something besides consents to forget."""
    key = f"account:{UID}/{learner}"
    await Caller(key, app.state.keeping).change(Seen(fingerprint="ab" * 8))
    return key


def forgetting_fails(monkeypatch, app, times: int):
    forget = app.state.keeping.voice.forget
    failures = [True] * times

    async def fails_then_forgets(key):
        if failures:
            failures.pop()
            raise RuntimeError("the audio bucket is down")
        await forget(key)

    monkeypatch.setattr(app.state.keeping.voice, "forget", fails_then_forgets)
    monkeypatch.setattr("app.account.learners.FORGET_PAUSE_SECONDS", 0)


async def test_a_removal_whose_forgetting_fails_once_is_tried_again_and_completes(
    app, env, monkeypatch
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added_with_consent(http)
        key = await kept_for(app, learner)
        forgetting_fails(monkeypatch, app, 1)
        removal = await http.delete(f"/api/account/learners/{learner}")

    assert removal.status_code == 200
    assert consents(env) == []
    assert await app.state.keeping.learners.load(key) == LearnerRecord()


async def test_a_removal_whose_forgetting_keeps_failing_is_finished_by_sending_it_again(
    app, env, monkeypatch
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added_with_consent(http)
        key = await kept_for(app, learner)
        forgetting_fails(monkeypatch, app, FORGET_TRIES)
        with pytest.raises(RuntimeError):
            await http.delete(f"/api/account/learners/{learner}")
        listed_between = await directory_of(app)
        again = await http.delete(f"/api/account/learners/{learner}")

    assert listed_between == []
    assert again.status_code == 404
    assert consents(env) == []
    assert await app.state.keeping.learners.load(key) == LearnerRecord()


async def test_a_removal_of_a_learner_already_gone_answers_404_though_forgetting_fails(
    app, env, monkeypatch
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added_with_consent(http)
        await http.delete(f"/api/account/learners/{learner}")
        forgetting_fails(monkeypatch, app, 99)
        again = await http.delete(f"/api/account/learners/{learner}")

    assert again.status_code == 404

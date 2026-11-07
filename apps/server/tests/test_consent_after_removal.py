"""A consent never outlives its learner: not when the learner is removed while the stores are being
forgotten, between the check and the write, or while a consent is being added with the learner, and
not when something other than the learner's absence is what fails."""

import pytest
from consent_sign_ins import consent_app
from signed_in import UID, client, signed_in
from voice_worker import worker_env

from app.account.directory import LearnerRemoved, account_key
from app.api import account_routes as routes_of_accounts

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


async def test_a_learner_that_cannot_be_checked_after_the_write_keeps_no_consent(
    app, env, monkeypatch
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added_without_consent(http)
        looked = routes_of_accounts.learner_of
        calls = []

        async def second_look_fails(keeping, uid, learner_id):
            calls.append(learner_id)
            if len(calls) > 1:
                raise RuntimeError("the directory is down")
            return await looked(keeping, uid, learner_id)

        monkeypatch.setattr("app.api.account_routes.learner_of", second_look_fails)
        failed = await http.put(consent_url(learner), json=CONSENT)

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "consent_not_kept"
    assert consents(env) == []


async def test_a_recordings_consent_for_a_learner_that_cannot_be_checked_answers_503_not_500(
    app, env, monkeypatch
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added_with_consent(http)

        looked = routes_of_accounts.learner_of
        calls = []

        async def check_after_the_write_fails(keeping, uid, learner_id):
            calls.append(learner_id)
            if len(calls) > 1:
                raise RuntimeError("the directory is down")
            return await looked(keeping, uid, learner_id)

        monkeypatch.setattr(
            "app.api.account_routes.learner_of", check_after_the_write_fails
        )
        failed = await http.put(
            voice_consent_url(learner), json={**CONSENT, "retentionDays": 30}
        )
        recordings = env.DB.rows("SELECT * FROM consents WHERE scope = 'recordings'")

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "consent_not_kept"
    assert recordings == []


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


async def test_a_removal_that_failed_part_way_is_finished_by_sending_it_again(
    app, env, monkeypatch
):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        learner = await added_with_consent(http)
        forget = app.state.keeping.voice.forget
        fail = [True]

        async def fails_once(key):
            if fail.pop() if fail else False:
                raise RuntimeError("the audio bucket is down")
            await forget(key)

        monkeypatch.setattr(app.state.keeping.voice, "forget", fails_once)
        with pytest.raises(RuntimeError):
            await http.delete(f"/api/account/learners/{learner}")
        listed_between = await directory_of(app)
        again = await http.delete(f"/api/account/learners/{learner}")

    assert listed_between == []
    assert again.status_code == 404
    assert consents(env) == []

"""A parent's say over a learner's voice recordings: agreeing to keep them with a fresh sign-in,
hearing and deleting what was kept, and stopping. No one else's account reaches any of it."""

import time

import pytest
from consent_sign_ins import consent_app
from signed_in import UID, added, chosen, client, signed_in
from test_voice_routes import METADATA, T2, as_device, offered
from voice_worker import worker_env

from app.account.consents import DAY_MS
from app.account.learners import removed
from app.api import account_routes as routes_of_accounts
from app.api import routes
from app.voice.curriculum import load_plans
from app.voice.recording_retention import sweep_audio

NOTICE_1 = {"noticeVersion": 1, "retentionDays": 30}
WAV_OF_3_SECONDS = b"RIFF" + b"\0" * (40 + 3 * 16_000 * 2)


@pytest.fixture
def env(monkeypatch):
    async def transcribe(*_):
        return "fourteen", 40

    monkeypatch.setattr(
        "app.voice.worker_evaluation.transcribe_intron_sync", transcribe
    )
    return worker_env()


@pytest.fixture
def app(monkeypatch, env):
    return consent_app(monkeypatch, env)


def key(learner_id: str, uid: str = UID) -> str:
    return f"account:{uid}/{learner_id}"


def voice(learner_id: str, path: str = "") -> str:
    return f"/api/account/learners/{learner_id}/voice{path}"


async def parent(http, learner_id: str = "") -> str:
    """Signs in as the parent, with a learner of their own."""
    await signed_in(http, firebaseIdToken="good")
    return learner_id or await added(http, "Ada")


async def agree(http, learner_id: str, days: int = 30, token: str = "fresh"):
    return await http.put(
        voice(learner_id, "/consent"),
        json={"noticeVersion": 1, "retentionDays": days, "firebaseIdToken": token},
    )


async def recorded(http, env, learner_id: str, n: int = 1, body: bytes = b"RIFF"):
    """The learner answers `n` times, and each is marked; the parent signs in again after."""
    await chosen(http, learner_id)
    offered(env, key(learner_id))
    samples = []
    for at in range(n):
        sample = (
            await http.post(
                "/api/voice/samples",
                json=METADATA,
                headers={"Idempotency-Key": f"k{learner_id}{at}"},
            )
        ).json()
        await http.put(
            sample["upload_path"], content=body, headers={"Content-Type": "audio/wav"}
        )
        marked = await http.post(f"/api/voice/samples/{sample['sample_id']}/evaluation")
        assert marked.status_code == 200, marked.text
        samples.append(sample["sample_id"])
    await signed_in(http, firebaseIdToken="good")
    return samples


async def test_only_a_signed_in_account_reaches_a_learners_recordings(app):
    async with client(app) as http:
        await as_device(http, "0a1b2c3d4e5f60718293a4b5c6d7e8f9")
        answers = [
            await http.get(voice("a1b2c3d4e5f6")),
            await http.put(voice("a1b2c3d4e5f6", "/consent"), json=NOTICE_1),
            await http.delete(voice("a1b2c3d4e5f6", "/consent")),
            await http.get(voice("a1b2c3d4e5f6", "/recordings/gvm_x/audio")),
            await http.delete(voice("a1b2c3d4e5f6", "/recordings/gvm_x")),
            await http.delete(voice("a1b2c3d4e5f6", "/recordings")),
        ]

    assert {answer.status_code for answer in answers} == {403}
    assert {answer.json()["detail"]["code"] for answer in answers} == {
        "account_required"
    }


async def test_a_learner_the_account_does_not_hold_is_not_found(app):
    async with client(app) as http:
        await parent(http)
        answer = await http.get(voice("a1b2c3d4e5f6"))

    assert answer.status_code == 404
    assert answer.json()["detail"]["code"] == "no_such_learner"


async def test_before_any_consent_a_learner_has_none_and_no_recordings(app):
    async with client(app) as http:
        learner = await parent(http)
        overview = await http.get(voice(learner))

    assert overview.status_code == 200
    assert overview.json() == {
        "consent": None,
        "recordings": [],
        "nextBefore": None,
        "nextBeforeId": None,
    }


async def test_a_parent_who_signed_in_just_now_agrees_and_it_is_kept_as_a_record(
    app, env
):
    before = int(time.time() * 1000)
    async with client(app) as http:
        learner = await parent(http)
        agreed = await agree(http, learner, 90)
        overview = await http.get(voice(learner))

    assert agreed.status_code == 200
    body = agreed.json()
    assert body["noticeVersion"] == 1 and body["retentionDays"] == 90
    assert before <= body["grantedAt"] <= int(time.time() * 1000)
    assert overview.json()["consent"] == body
    assert env.DB.rows("SELECT * FROM consents") == [
        {
            "id": 1,
            "learner_key": key(learner),
            "account_uid": UID,
            "scope": "recordings",
            "notice_version": 1,
            "retention_days": 90,
            "granted_at": body["grantedAt"],
            "revoked_at": None,
        }
    ]


@pytest.mark.parametrize(
    ("token", "status", "code"),
    [
        ("stale", 401, "sign_in_stale"),
        ("undated", 401, "sign_in_stale"),
        ("other", 403, "sign_in_other_account"),
        ("password", 403, "sign_in_not_google"),
        ("forged", 401, "sign_in_invalid"),
    ],
)
async def test_a_sign_in_that_is_stale_foreign_or_invalid_grants_nothing(
    app, env, token, status, code
):
    async with client(app) as http:
        learner = await parent(http)
        refused = await agree(http, learner, token=token)
        overview = await http.get(voice(learner))

    assert refused.status_code == status
    assert refused.json()["detail"]["code"] == code
    assert overview.json()["consent"] is None
    assert env.DB.rows("SELECT * FROM consents") == []


@pytest.mark.parametrize(
    ("body", "status"),
    [
        ({"noticeVersion": 2, "retentionDays": 30}, 400),
        ({"noticeVersion": 0, "retentionDays": 30}, 400),
        ({"noticeVersion": 1, "retentionDays": 60}, 422),
        ({"noticeVersion": 1}, 422),
    ],
)
async def test_a_notice_graspy_does_not_show_or_a_retention_it_does_not_offer_is_refused(
    app, env, body, status
):
    async with client(app) as http:
        learner = await parent(http)
        refused = await http.put(
            voice(learner, "/consent"), json={**body, "firebaseIdToken": "fresh"}
        )

    assert refused.status_code == status
    if status == 400:
        assert refused.json()["detail"]["code"] == "notice_unknown"
    assert env.DB.rows("SELECT * FROM consents") == []


async def test_agreeing_again_replaces_the_consent_and_leaves_one_active(app, env):
    async with client(app) as http:
        learner = await parent(http)
        await agree(http, learner, 30)
        await agree(http, learner, 365)
        overview = await http.get(voice(learner))

    assert overview.json()["consent"]["retentionDays"] == 365
    rows = env.DB.rows("SELECT retention_days, revoked_at FROM consents")
    assert [row["retention_days"] for row in rows] == [30, 365]
    assert [row["revoked_at"] is None for row in rows] == [False, True]


async def test_the_learner_list_says_whether_a_parent_agreed(app):
    async with client(app) as http:
        learner = await parent(http)
        another = await added(http, "Bo")
        before = (await http.get("/api/account/learners")).json()["learners"]
        await agree(http, learner, 90)
        after = (await http.get("/api/account/learners")).json()["learners"]
        await http.delete(voice(learner, "/consent"))
        stopped = (await http.get("/api/account/learners")).json()["learners"]

    def consents(learners):
        return {one["id"]: one["voiceConsent"] for one in learners}

    assert consents(before) == {learner: None, another: None}
    assert consents(after) == {
        learner: {"noticeVersion": 1, "retentionDays": 90},
        another: None,
    }
    assert consents(stopped) == {learner: None, another: None}


async def test_a_kept_recording_is_listed_heard_and_deleted_by_the_parent(app, env):
    async with client(app) as http:
        learner = await parent(http)
        await agree(http, learner, 30)
        [sample] = await recorded(http, env, learner, body=WAV_OF_3_SECONDS)
        listed = (await http.get(voice(learner))).json()["recordings"]
        heard = await http.get(voice(learner, f"/recordings/{sample}/audio"))
        deleted = await http.delete(voice(learner, f"/recordings/{sample}"))
        again = await http.delete(voice(learner, f"/recordings/{sample}"))
        after = (await http.get(voice(learner))).json()["recordings"]
        gone = await http.get(voice(learner, f"/recordings/{sample}/audio"))

    [item] = listed
    [row] = env.DB.rows("SELECT uploaded_at, expires_at FROM samples")
    assert item == {
        "id": sample,
        "recordedAt": row["uploaded_at"],
        "expiresAt": row["expires_at"],
        "lesson": load_plans()[T2].title["en"],
        "transcript": "fourteen",
        "durationSeconds": 3,
        "bytes": len(WAV_OF_3_SECONDS),
    }
    assert row["expires_at"] - row["uploaded_at"] >= 30 * DAY_MS - 1_000
    assert heard.status_code == 200 and heard.content == WAV_OF_3_SECONDS
    assert heard.headers["content-type"] == "audio/wav"
    assert heard.headers["cache-control"] == "private, no-store"
    assert deleted.status_code == again.status_code == 204
    assert after == [] and gone.status_code == 404
    assert gone.json()["detail"]["code"] == "recording_gone"
    assert env.AUDIO.objects == {}
    [row] = env.DB.rows("SELECT audio_deleted_at FROM samples")
    assert row["audio_deleted_at"] is not None


async def test_recordings_are_listed_newest_first_a_page_at_a_time(app, env):
    async with client(app) as http:
        learner = await parent(http)
        await agree(http, learner)
        samples = await recorded(http, env, learner, n=3)
        for at, sample in enumerate(samples):
            env.DB.db.execute(
                "UPDATE samples SET uploaded_at = ? WHERE id = ?", (1000 + at, sample)
            )
        first = (await http.get(voice(learner), params={"limit": 2})).json()
        second = (
            await http.get(
                voice(learner), params={"limit": 2, "before": first["nextBefore"]}
            )
        ).json()

    assert [one["id"] for one in first["recordings"]] == [samples[2], samples[1]]
    assert first["nextBefore"] == 1001
    assert [one["id"] for one in second["recordings"]] == [samples[0]]
    assert second["nextBefore"] is None


async def test_a_page_starts_after_its_cursor_and_before_zero_is_an_empty_page(
    app, env
):
    async with client(app) as http:
        learner = await parent(http)
        await agree(http, learner)
        samples = await recorded(http, env, learner, n=3)
        env.DB.db.execute("UPDATE samples SET uploaded_at = 1000")
        ordered = sorted(samples, reverse=True)
        first = (await http.get(voice(learner), params={"limit": 2})).json()
        second = (
            await http.get(
                voice(learner),
                params={
                    "limit": 2,
                    "before": first["nextBefore"],
                    "beforeId": first["nextBeforeId"],
                },
            )
        ).json()
        zero = (await http.get(voice(learner), params={"before": 0})).json()
        huge = await http.get(voice(learner), params={"before": 2**60})

    assert [one["id"] for one in first["recordings"]] == ordered[:2]
    assert (first["nextBefore"], first["nextBeforeId"]) == (1000, ordered[1])
    assert [one["id"] for one in second["recordings"]] == ordered[2:]
    assert second["nextBefore"] is None and second["nextBeforeId"] is None
    assert zero["recordings"] == []
    assert huge.status_code == 422


async def test_a_recording_past_its_time_is_neither_shown_nor_heard_and_the_sweep_deletes_it(
    app, env
):
    async with client(app) as http:
        learner = await parent(http)
        await agree(http, learner)
        [sample] = await recorded(http, env, learner)
        env.DB.db.execute("UPDATE samples SET expires_at = 1")
        listed = (await http.get(voice(learner))).json()["recordings"]
        heard = await http.get(voice(learner, f"/recordings/{sample}/audio"))
        assert len(env.AUDIO.objects) == 1
        await sweep_audio(env)

    assert listed == [] and heard.status_code == 404
    assert env.AUDIO.objects == {}


async def test_stopping_keeps_what_was_kept_and_keeps_nothing_new(app, env):
    async with client(app) as http:
        learner = await parent(http)
        await agree(http, learner)
        [kept] = await recorded(http, env, learner)
        stopped = await http.delete(voice(learner, "/consent"))
        again = await http.delete(voice(learner, "/consent"))
        await chosen(http, learner)
        later = await http.post(
            "/api/voice/samples",
            json=METADATA,
            headers={"Idempotency-Key": "later"},
        )
        await http.put(
            later.json()["upload_path"],
            content=b"RIFF",
            headers={"Content-Type": "audio/wav"},
        )
        await http.post(f"/api/voice/samples/{later.json()['sample_id']}/evaluation")
        await signed_in(http, firebaseIdToken="good")
        overview = (await http.get(voice(learner))).json()

    assert stopped.json() == again.json() == {"deleted": 0, "more": False}
    assert overview["consent"] is None
    assert [one["id"] for one in overview["recordings"]] == [kept]
    assert len(env.AUDIO.objects) == 1
    assert [
        row["revoked_at"] is not None for row in env.DB.rows("SELECT * FROM consents")
    ] == [True]


async def test_stopping_and_deleting_removes_every_kept_recording(app, env):
    async with client(app) as http:
        learner = await parent(http)
        await agree(http, learner)
        await recorded(http, env, learner, n=3)
        stopped = await http.delete(
            voice(learner, "/consent"), params={"deleteRecordings": "true"}
        )
        overview = (await http.get(voice(learner))).json()

    assert stopped.json() == {"deleted": 3, "more": False}
    assert overview == {
        "consent": None,
        "recordings": [],
        "nextBefore": None,
        "nextBeforeId": None,
    }
    assert env.AUDIO.objects == {}
    assert (
        len(env.DB.rows("SELECT id FROM samples WHERE audio_deleted_at IS NOT NULL"))
        == 3
    )


async def test_deleting_all_goes_on_while_there_are_more_and_is_safe_to_repeat(
    app, env, monkeypatch
):
    monkeypatch.setattr("app.voice.parent_recordings.PAGE", 2)
    monkeypatch.setattr("app.voice.parent_recordings.PAGES", 1)
    async with client(app) as http:
        learner = await parent(http)
        await agree(http, learner)
        await recorded(http, env, learner, n=3)
        first = await http.delete(voice(learner, "/recordings"))
        second = await http.delete(voice(learner, "/recordings"))
        third = await http.delete(voice(learner, "/recordings"))

    assert first.json() == {"deleted": 2, "more": True}
    assert second.json() == {"deleted": 1, "more": False}
    assert third.json() == {"deleted": 0, "more": False}
    assert env.AUDIO.objects == {}


async def test_another_account_cannot_list_hear_or_delete_a_recording(app, env):
    async with client(app) as http:
        learner = await parent(http)
        await agree(http, learner)
        [sample] = await recorded(http, env, learner)
        mine = http.headers["Authorization"]
        await signed_in(http, firebaseIdToken="good2")
        theirs = await added(http, "Grace")
        answers = [
            await http.get(voice(learner)),
            await http.get(voice(learner, f"/recordings/{sample}/audio")),
            await http.delete(voice(learner, f"/recordings/{sample}")),
            await http.delete(voice(learner, "/recordings")),
            await http.delete(
                voice(learner, "/consent"), params={"deleteRecordings": "true"}
            ),
            await agree(http, learner, token="other"),
        ]
        their_own = await http.get(voice(theirs, f"/recordings/{sample}/audio"))
        http.headers["Authorization"] = mine
        still = (await http.get(voice(learner))).json()

    assert {answer.status_code for answer in answers} == {404}
    assert their_own.status_code == 404
    assert [one["id"] for one in still["recordings"]] == [sample]
    assert still["consent"]["retentionDays"] == 30
    assert len(env.AUDIO.objects) == 1


async def test_one_learner_of_an_account_cannot_reach_a_siblings_recording(app, env):
    async with client(app) as http:
        ada = await parent(http)
        bo = await added(http, "Bo")
        await agree(http, ada)
        await agree(http, bo)
        [sample] = await recorded(http, env, ada)
        siblings = await http.get(voice(bo, f"/recordings/{sample}/audio"))
        kept_from_bo = await http.delete(voice(bo, f"/recordings/{sample}"))
        bo_list = (await http.get(voice(bo))).json()["recordings"]

    assert siblings.status_code == 404 and kept_from_bo.status_code == 204
    assert bo_list == [] and len(env.AUDIO.objects) == 1


async def test_a_recording_still_being_marked_is_not_the_parents_to_delete(app, env):
    async with client(app) as http:
        learner = await parent(http)
        await agree(http, learner)
        await chosen(http, learner)
        sample = (
            await http.post(
                "/api/voice/samples", json=METADATA, headers={"Idempotency-Key": "k"}
            )
        ).json()
        await http.put(
            sample["upload_path"],
            content=b"RIFF",
            headers={"Content-Type": "audio/wav"},
        )
        await signed_in(http, firebaseIdToken="good")
        deleted = await http.delete(
            voice(learner, f"/recordings/{sample['sample_id']}")
        )
        everything = await http.delete(voice(learner, "/recordings"))

    assert deleted.status_code == 204
    assert everything.json() == {"deleted": 0, "more": False}
    assert len(env.AUDIO.objects) == 1


async def test_removing_a_learner_forgets_their_consent_and_kept_recordings(app, env):
    async with client(app) as http:
        learner = await parent(http)
        another = await added(http, "Bo")
        await agree(http, learner)
        await agree(http, another)
        await recorded(http, env, learner, n=2)
        removed = await http.delete(f"/api/account/learners/{learner}")

    assert removed.status_code == 200
    assert [row["learner_key"] for row in env.DB.rows("SELECT * FROM consents")] == [
        key(another)
    ]
    assert env.AUDIO.objects == {}


async def test_a_learner_removed_while_google_is_asked_is_not_agreed_for_recordings(
    app, env, monkeypatch
):
    lookup = routes.verified

    async def verified(id_token, api_key, **kwargs):
        signed = await lookup(id_token, api_key, **kwargs)
        if id_token == "fresh":
            await removed(app.state.keeping, UID, learner_id)
        return signed

    async with client(app) as http:
        learner_id = await parent(http)
        monkeypatch.setattr("app.api.routes.verified", verified)
        refused = await agree(http, learner_id)

    assert refused.status_code == 404
    assert refused.json()["detail"]["code"] == "no_such_learner"
    assert env.DB.rows("SELECT * FROM consents") == []


async def test_a_learner_removed_between_the_check_and_the_write_leaves_no_recordings_consent(
    app, env, monkeypatch
):
    write = routes_of_accounts.grant_consent

    async def racing(database, key, *rest):
        await removed(app.state.keeping, UID, learner_id)
        return await write(database, key, *rest)

    async with client(app) as http:
        learner_id = await parent(http)
        monkeypatch.setattr("app.api.account_routes.grant_consent", racing)
        refused = await agree(http, learner_id)

    assert refused.status_code == 404
    assert refused.json()["detail"]["code"] == "no_such_learner"
    assert env.DB.rows("SELECT * FROM consents") == []

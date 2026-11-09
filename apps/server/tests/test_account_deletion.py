"""Deleting the account forgets what graspy kept, then asks Firebase to forget the sign-in
record; a Firebase that fails leaves the account's data gone and the call safe to repeat."""

import pytest
from signed_in import added, client, signed_in, signed_in_app

from app.security.firebase_admin import RemovalFailed


class Remover:
    def __init__(self, fails: int = 0):
        self.fails = fails
        self.removed: list[str] = []

    async def remove_user(self, uid: str) -> None:
        if self.fails:
            self.fails -= 1
            raise RemovalFailed("Identity Toolkit refused the deletion (500)")
        self.removed.append(uid)


@pytest.fixture
def app(monkeypatch):
    return signed_in_app(monkeypatch)


async def learners(http) -> list:
    return (await http.get("/api/account/learners")).json()["learners"]


async def test_the_firebase_user_is_removed_after_the_learners(app):
    app.state.firebase_admin = Remover()
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        await added(http, "Ada")
        deleted = await http.delete("/api/account")
        left = await learners(http)

    assert deleted.status_code == 204
    assert left == []
    assert app.state.firebase_admin.removed == ["uid123"]


async def test_a_firebase_that_fails_leaves_the_data_deleted_and_a_retry_finishes(app):
    app.state.firebase_admin = Remover(fails=1)
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        await added(http, "Ada")
        failed = await http.delete("/api/account")
        left = await learners(http)
        again = await http.delete("/api/account")

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "account_record_not_removed"
    assert left == []
    assert again.status_code == 204
    assert app.state.firebase_admin.removed == ["uid123"]


async def test_a_request_with_no_session_asks_nothing_of_firebase(app):
    app.state.firebase_admin = Remover()
    async with client(app) as http:
        refused = await http.delete("/api/account")

    assert refused.status_code == 401
    assert app.state.firebase_admin.removed == []


async def test_a_server_with_no_firebase_to_remove_from_still_deletes(app):
    async with client(app) as http:
        await signed_in(http, firebaseIdToken="good")
        await added(http, "Ada")
        deleted = await http.delete("/api/account")

    assert deleted.status_code == 204

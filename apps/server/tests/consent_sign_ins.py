"""Google's sign-in as a parent's consent meets it: tokens that were minted just now, minutes ago, for
another account, or without saying when the person signed in."""

import time

from signed_in import UID
from voice_worker import voice_app

from app.security import firebase

OTHER_UID = "uid456"
# How long ago each token's sign-in happened.
AGES = {"good": 3600, "fresh": 30, "stale": 6 * 60, "other": 30, "good2": 3600}


def consent_app(monkeypatch, env):
    """The voice app, whose sign-in knows the tokens above; "undated" carries no sign-in time."""
    application = voice_app(monkeypatch, env)

    async def verified(id_token, _api_key, **_):
        if id_token == "undated":
            return firebase.SignedIn(uid=UID, name="Ada")
        if id_token not in AGES:
            raise firebase.InvalidSignIn("The sign-in is not valid. Sign in again.")
        uid = OTHER_UID if id_token in ("other", "good2") else UID
        return firebase.SignedIn(
            uid=uid, name="Ada", auth_time=int(time.time()) - AGES[id_token]
        )

    monkeypatch.setattr("app.api.routes.verified", verified)
    return application

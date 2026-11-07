"""A parent's service consent for a learner, written straight to D1, for tests that are about
something else and need only a learner graspy may serve."""

from signed_in import UID

from app.account.consents import SERVICE, grant_consent
from app.account.directory import learner_key

NOTICE = 1


async def service_agreed(env, learner_id: str, uid: str = UID) -> None:
    await grant_consent(
        env.DB, learner_key(uid, learner_id), uid, SERVICE, NOTICE, None, 1
    )

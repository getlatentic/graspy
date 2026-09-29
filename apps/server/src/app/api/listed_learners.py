"""A learner as an account lists them: with the parent's consents held for them."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from ..account.consents import RECORDINGS, SERVICE, consents_of_account
from ..account.directory import Directory, Learner, learner_key
from ..wire import Wire


class VoiceConsent(Wire):
    """The parent's consent to keep the learner's voice recordings."""

    notice_version: int
    retention_days: int


class ServiceConsent(Wire):
    """The parent's consent to use graspy for the learner at all."""

    notice_version: int
    granted_at: int


class ListedLearner(Learner):
    voice_consent: VoiceConsent | None = None
    service_consent: ServiceConsent | None = None


class ListedLearners(BaseModel):
    learners: list[ListedLearner]


def listed(learner: Learner, held: dict[str, dict]) -> ListedLearner:
    """`held` is the learner's active consents, by scope."""
    voice, service = held.get(RECORDINGS), held.get(SERVICE)
    return ListedLearner(
        **learner.model_dump(),
        voice_consent=None if voice is None else VoiceConsent.model_validate(voice),
        service_consent=(
            None if service is None else ServiceConsent.model_validate(service)
        ),
    )


async def listed_with_consents(
    voice_env: Any | None, uid: str, directory: Directory
) -> ListedLearners:
    """Without the Worker's bindings there is nowhere consent is kept, and none is shown."""
    held = {} if voice_env is None else await consents_of_account(voice_env.DB, uid)
    return ListedLearners(
        learners=[
            listed(
                one,
                {
                    scope: row
                    for (key, scope), row in held.items()
                    if key == learner_key(uid, one.id)
                },
            )
            for one in directory.learners
        ]
    )

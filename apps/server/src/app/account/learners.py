"""An account's learners over the stores: opening the account at sign-in, and
adding, renaming and forgetting learners with everything kept for them."""

from __future__ import annotations

import asyncio
import logging

from ..caller import Keeping
from ..learner.record import LearnerRecord
from .directory import (
    Directory,
    Learner,
    LearnerAdded,
    LearnerRemoved,
    LearnerRenamed,
    account_key,
    learner_key,
    new_learner,
)

logger = logging.getLogger(__name__)

# Forgetting what was kept for a removed learner is tried this often, a little longer apart each time.
FORGET_TRIES = 3
FORGET_PAUSE_SECONDS = 0.5

# Names the account holder's own learner when Google gives no name.
FIRST_LEARNER = "Learner"


class TooManyLearners(Exception):
    pass


class NoSuchLearner(Exception):
    pass


async def _had_learnt(keeping: Keeping, key: str) -> bool:
    record = await keeping.learners.load(key)
    return record != LearnerRecord() or await keeping.learners.plan(key) is not None


async def opened(keeping: Keeping, uid: str, name: str, now: int) -> Directory:
    """At sign-in. An account that learnt before it held learners kept its
    record and plan as its own: they become its first learner's, named as
    Google names the account holder."""
    directory = await keeping.learners.directory(account_key(uid))
    if directory.learners or not await _had_learnt(keeping, account_key(uid)):
        return directory
    first = new_learner(name.split()[0][:40] if name.strip() else FIRST_LEARNER, now)
    await keeping.learners.move(account_key(uid), learner_key(uid, first.id))
    await keeping.learners.change_directory(
        account_key(uid), LearnerAdded(learner=first)
    )
    return await keeping.learners.directory(account_key(uid))


async def learner_of(keeping: Keeping, uid: str, learner_id: str) -> Learner:
    found = (await keeping.learners.directory(account_key(uid))).find(learner_id)
    if found is None:
        raise NoSuchLearner(learner_id)
    return found


async def added(keeping: Keeping, uid: str, name: str, now: int) -> Learner:
    learner = new_learner(name, now)
    await keeping.learners.change_directory(
        account_key(uid), LearnerAdded(learner=learner)
    )
    # A full list takes no one; another device may have filled it meanwhile.
    try:
        return await learner_of(keeping, uid, learner.id)
    except NoSuchLearner:
        raise TooManyLearners from None


async def renamed(keeping: Keeping, uid: str, learner_id: str, name: str) -> Learner:
    await learner_of(keeping, uid, learner_id)
    await keeping.learners.change_directory(
        account_key(uid), LearnerRenamed(id=learner_id, name=name)
    )
    return await learner_of(keeping, uid, learner_id)


async def unadded(keeping: Keeping, uid: str, learner_id: str) -> None:
    """Takes back a learner just added, who has nothing kept for them yet but possibly a consent
    that was written though its write was reported failed: the directory's entry and the consents
    go, each tried even if the other fails, which is all that can be done where the stores that
    removing a learner also clears are the ones that failed."""
    try:
        await keeping.learners.change_directory(
            account_key(uid), LearnerRemoved(id=learner_id)
        )
    except Exception:
        logger.exception("A learner just added could not be taken out of the directory")
        raise
    finally:
        await keeping.voice.forget_consents(learner_key(uid, learner_id))


async def _forgot_kept(keeping: Keeping, key: str) -> None:
    record = await keeping.learners.load(key)
    for conversation_id in record.conversations:
        await keeping.conversations.forget(conversation_id)
    for mark in record.topics:
        if mark.lesson_id:
            await keeping.lessons.forget(mark.lesson_id)
    await keeping.voice.forget(key)
    await keeping.threads.forget(key)
    await keeping.learners.forget(key)


async def _forgot_kept_again(keeping: Keeping, key: str) -> None:
    """The directory no longer lists the learner, so nothing in the app can send the removal
    again: a failure is tried a few times before it is raised, for the operator to finish."""
    for attempt in range(FORGET_TRIES):
        try:
            await _forgot_kept(keeping, key)
            return
        except Exception:
            logger.exception("Forgetting %s failed, try %d", key, attempt + 1)
            if attempt + 1 == FORGET_TRIES:
                raise
            await asyncio.sleep(FORGET_PAUSE_SECONDS * (attempt + 1))


async def removed(keeping: Keeping, uid: str, learner_id: str) -> Directory:
    """The learner leaves the directory first, then everything kept for them goes: their record,
    plan, lessons, tutor conversations, as the tutor recalls them and as their devices show them,
    voice lessons and consents. A consent written while this runs either finds the learner gone
    and takes itself back, or is written before the stores are forgotten and goes with them.

    Removing a learner already gone still forgets what was kept for them, so a removal that failed
    part way is finished by sending it again, and answers 404."""
    key = learner_key(uid, learner_id)
    try:
        await learner_of(keeping, uid, learner_id)
    except NoSuchLearner:
        try:
            await _forgot_kept(keeping, key)
        except Exception:
            logger.exception("Forgetting %s, a learner already gone, failed", key)
        raise
    await keeping.learners.change_directory(
        account_key(uid), LearnerRemoved(id=learner_id)
    )
    await _forgot_kept_again(keeping, key)
    return await keeping.learners.directory(account_key(uid))


async def closed(keeping: Keeping, uid: str) -> None:
    """Every learner, and anything the account kept as its own."""
    directory = await keeping.learners.directory(account_key(uid))
    for learner in directory.learners:
        await removed(keeping, uid, learner.id)
    await _forgot_kept(keeping, account_key(uid))

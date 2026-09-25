"""An account's learners over the stores: opening the account at sign-in, and
adding, renaming and forgetting learners with everything kept for them."""

from __future__ import annotations

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


async def _forgot_kept(keeping: Keeping, key: str) -> None:
    record = await keeping.learners.load(key)
    for conversation_id in record.conversations:
        await keeping.conversations.forget(conversation_id)
    for mark in record.topics:
        if mark.lesson_id:
            await keeping.lessons.forget(mark.lesson_id)
    await keeping.learners.forget(key)


async def removed(keeping: Keeping, uid: str, learner_id: str) -> Directory:
    """Everything kept for the learner goes: their record, plan, lessons and
    tutor conversations."""
    await learner_of(keeping, uid, learner_id)
    await _forgot_kept(keeping, learner_key(uid, learner_id))
    await keeping.learners.change_directory(
        account_key(uid), LearnerRemoved(id=learner_id)
    )
    return await keeping.learners.directory(account_key(uid))


async def closed(keeping: Keeping, uid: str) -> None:
    """Every learner, and anything the account kept as its own."""
    directory = await keeping.learners.directory(account_key(uid))
    for learner in directory.learners:
        await removed(keeping, uid, learner.id)
    await _forgot_kept(keeping, account_key(uid))

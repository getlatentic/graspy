package com.latentic.graspy.account

import java.io.IOException

/**
 * Refused so that nothing unsent is lost. Offline the switch cannot be made; online it is made when asked for
 * once more with loseUnsent.
 */
class UnsentChanges(val offline: Boolean) :
    Exception(if (offline) "Connect to the internet first, so nothing is lost" else "Some changes haven't been sent")

/** What "Who's learning?" asks of the account: a learner added, and the device switched to one. */
interface LearnerPicks {
    suspend fun add(name: String): LearnerDto

    suspend fun choose(learner: LearnerDto, loseUnsent: Boolean = false)
}

/**
 * Which of the account's learners this device learns as. The first chosen after signing in takes the
 * device's own learning; any later choice starts from a wiped device.
 */
class LearnerChoice(
    private val accounts: AccountStore,
    private val api: AccountApi,
    private val sessions: SessionTokens,
    private val deviceId: () -> String,
    private val outbox: Outbox,
    private val online: suspend () -> Boolean,
    private val leaveLearner: suspend () -> Unit,
    private val claimDeviceLearning: suspend (uid: String, learnerKey: String) -> Unit,
) : LearnerPicks {
    /** [loseUnsent] switches even though what the device holds for its learner has not all reached graspy. */
    override suspend fun choose(learner: LearnerDto, loseUnsent: Boolean) {
        val account = accounts.account.value ?: throw IllegalStateException("Sign in to choose a learner")
        if (account.learner?.id == learner.id) return
        if (account.deviceJoins) joinFirst(account, learner) else switchFrom(account, learner, loseUnsent)
    }

    /** Whoever adds a learner has confirmed they are that learner, or their parent or guardian. */
    override suspend fun add(name: String): LearnerDto = api.add(NewLearnerDto(name = name, guardian = true))

    private suspend fun joinFirst(account: Account, learner: LearnerDto) {
        val issued = issuedFor(learner, ChosenLearnerDto(deviceId = deviceId()))
        claimDeviceLearning(account.uid, learnerKey(account.uid, learner.id))
        takeUp(account, issued)
    }

    private suspend fun switchFrom(account: Account, learner: LearnerDto, loseUnsent: Boolean) {
        val leaving = account.learnerKey
        if (leaving != null && !loseUnsent && !outbox.flush(leaving)) throw UnsentChanges(offline = !online())
        // Issued before the wipe, so a switch graspy cannot make leaves the device as it was.
        val issued = issuedFor(learner, ChosenLearnerDto())
        leaveLearner()
        takeUp(account, issued)
    }

    private suspend fun issuedFor(learner: LearnerDto, chosen: ChosenLearnerDto): Issued {
        val issued = api.session(learner.id, chosen)
        return Issued(issued, issued.learner ?: throw IOException("graspy issued a session with no learner"))
    }

    private fun takeUp(account: Account, issued: Issued) {
        sessions.keep(account.uid, issued.session)
        accounts.setLearner(ChosenLearner(issued.learner.id, issued.learner.name))
    }

    private class Issued(val session: IssuedSessionDto, val learner: LearnerDto)
}

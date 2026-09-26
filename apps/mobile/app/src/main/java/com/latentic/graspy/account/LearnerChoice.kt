package com.latentic.graspy.account

import java.io.IOException

/** Refused so that nothing unsent is lost: the device must reach graspy first. */
class UnsentChanges : Exception("Connect to the internet first, so nothing is lost")

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
    private val leaveLearner: suspend () -> Unit,
    private val claimDeviceLearning: suspend (uid: String, learnerKey: String) -> Unit,
) {
    suspend fun choose(learner: LearnerDto) {
        val account = accounts.account.value ?: throw IllegalStateException("Sign in to choose a learner")
        if (account.learner?.id == learner.id) return
        if (account.deviceJoins) joinFirst(account, learner) else switchFrom(account, learner)
    }

    /** Whoever adds a learner has confirmed they are that learner, or their parent or guardian. */
    suspend fun addAndChoose(name: String) {
        choose(api.add(NewLearnerDto(name = name, guardian = true)))
    }

    private suspend fun joinFirst(account: Account, learner: LearnerDto) {
        val issued = api.session(learner.id, ChosenLearnerDto(deviceId = deviceId()))
        claimDeviceLearning(account.uid, learnerKey(account.uid, learner.id))
        takeUp(account, issued)
    }

    private suspend fun switchFrom(account: Account, learner: LearnerDto) {
        val leaving = account.learnerKey
        if (leaving != null && !outbox.flush(leaving)) throw UnsentChanges()
        leaveLearner()
        takeUp(account, api.session(learner.id, ChosenLearnerDto()))
    }

    private fun takeUp(account: Account, issued: IssuedSessionDto) {
        val learner = issued.learner ?: throw IOException("graspy issued a session with no learner")
        sessions.keep(account.uid, issued)
        accounts.setLearner(ChosenLearner(learner.id, learner.name))
    }
}

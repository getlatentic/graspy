package com.latentic.graspy.account

import com.latentic.graspy.auth.FreshSignIn
import java.io.IOException
import kotlin.math.abs

/**
 * Refused so that nothing unsent is lost. Offline the switch cannot be made; online it is made when asked for
 * once more with loseUnsent.
 */
class UnsentChanges(val offline: Boolean) :
    Exception(if (offline) "Connect to the internet first, so nothing is lost" else "Some changes haven't been sent")

/**
 * What "Who's learning?" asks of the account: a learner added, a parent's agreement recorded, and the device switched
 * to a learner whose parent has agreed.
 */
interface LearnerPicks {
    /** The learner is added with the parent's agreement, which [consent] proves. */
    suspend fun add(name: String, consent: FreshSignIn): LearnerDto

    /**
     * A learner of this name that graspy added moments ago, if there is one: an add whose answer never reached the
     * phone, so that trying again does not add them twice.
     */
    suspend fun addedAlready(name: String): LearnerDto?

    /** Records the parent's agreement for a learner already added, and returns them as agreed for. */
    suspend fun agree(learner: LearnerDto, consent: FreshSignIn): LearnerDto

    /** Refuses a learner whose parent has not agreed. */
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
    private val now: () -> Long = System::currentTimeMillis,
) : LearnerPicks {
    /** [loseUnsent] switches even though what the device holds for its learner has not all reached graspy. */
    override suspend fun choose(learner: LearnerDto, loseUnsent: Boolean) {
        val account = accounts.account.value ?: throw IllegalStateException("Sign in to choose a learner")
        check(learner.serviceConsent != null) { "A parent has yet to agree to graspy teaching this learner" }
        val inUse = account.learner
        if (inUse?.id == learner.id) {
            if (!inUse.consented) accounts.changeLearner(inUse.id) { it.copy(consented = true) }
            return
        }
        if (account.deviceJoins) joinFirst(account, learner) else switchFrom(account, learner, loseUnsent)
    }

    /** Whoever adds a learner has confirmed they are that learner, or their parent or guardian. */
    override suspend fun add(name: String, consent: FreshSignIn): LearnerDto =
        api.add(NewLearnerDto(name = name, guardian = true, consent = ConsentProofDto(CONSENT_NOTICE_VERSION, consent.idToken)))

    /** graspy's clock and the phone's may differ by minutes; a learner of the same name is not added twice a day. */
    override suspend fun addedAlready(name: String): LearnerDto? =
        api.learners().learners.firstOrNull { it.name == name && abs(now() - it.createdAt) <= JUST_ADDED_MILLIS }

    override suspend fun agree(learner: LearnerDto, consent: FreshSignIn): LearnerDto =
        learner.copy(serviceConsent = api.agree(learner.id, ConsentProofDto(CONSENT_NOTICE_VERSION, consent.idToken)))

    private suspend fun joinFirst(account: Account, learner: LearnerDto) {
        val issued = issuedFor(learner, ChosenLearnerDto(deviceId = deviceId()))
        claimDeviceLearning(account.uid, learnerKey(account.uid, learner.id))
        takeUp(account, issued)
    }

    private suspend fun switchFrom(account: Account, learner: LearnerDto, loseUnsent: Boolean) {
        val leaving = account.agreedLearnerKey
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
        accounts.setLearner(ChosenLearner(issued.learner.id, issued.learner.name, consented = true))
    }

    private companion object {
        const val JUST_ADDED_MILLIS = 10 * 60 * 1_000L
    }

    private class Issued(val session: IssuedSessionDto, val learner: LearnerDto)
}

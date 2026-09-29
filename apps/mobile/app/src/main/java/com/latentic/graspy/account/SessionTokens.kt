package com.latentic.graspy.account

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.HttpException

private data class HeldSession(
    val token: String,
    val expiresAtMillis: Long,
    val uid: String,
    val learnerId: String?,
)

/**
 * The graspy session this device holds, naming the signed-in account and the learner it learns as.
 *
 * It is made by exchanging the Firebase ID token, and held in memory until it expires. Requests made
 * together share one exchange. A session made for another account or learner is never used.
 */
class SessionTokens(
    private val accounts: AccountStore,
    private val deviceId: () -> String,
    /** Null when Firebase no longer holds that account's sign-in. */
    private val idToken: suspend (uid: String, fresh: Boolean) -> String?,
    private val exchange: suspend (SessionRequestDto) -> IssuedSessionDto,
    private val learnerGone: suspend () -> Unit,
    /** Told the uid of the account Google no longer holds. */
    private val signedOutElsewhere: suspend (uid: String) -> Unit,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val exchanging = Mutex()

    @Volatile
    private var held: HeldSession? = null

    suspend fun token(): String = exchanging.withLock { usable()?.token ?: mint() }

    /** The server refused [refused]: a new session, unless a request alongside has already made one. */
    suspend fun renew(refused: String): String = exchanging.withLock {
        usable()?.token?.takeIf { it != refused } ?: mint()
    }

    /** A session the server issued: for the account alone, or for one of its learners. */
    fun keep(uid: String, issued: IssuedSessionDto) {
        held = HeldSession(issued.token, clock() + issued.expiresIn * MILLIS, uid, issued.learner?.id)
    }

    fun forget() {
        held = null
    }

    private fun usable(): HeldSession? {
        val session = held ?: return null
        val account = accounts.account.value ?: return null
        val current = session.uid == account.uid && session.learnerId == account.learner?.id
        return session.takeIf { current && it.expiresAtMillis - RENEW_MARGIN_MILLIS > clock() }
    }

    private suspend fun mint(): String {
        val account = accounts.account.value ?: throw SessionRefusal("Nobody is signed in on this device")
        val issued = exchangeFor(account)
        if (issued == null) {
            signedOutElsewhere(account.uid)
            throw SessionRefusal("Google no longer holds this sign-in")
        }
        if (stillLearnsAs(account)) follow(account.learner, issued.learner)
        if (accounts.account.value?.uid == account.uid) keep(account.uid, issued)
        return issued.token
    }

    /**
     * An answer speaks of the account and learner its exchange began for: one signed out, or switched from, while
     * it ran leaves whoever the device learns as since untouched.
     */
    private fun stillLearnsAs(account: Account): Boolean {
        val now = accounts.account.value ?: return false
        return now.uid == account.uid && now.learner?.id == account.learner?.id
    }

    /** Refused once, the ID token is made again: the server's clock may count the cached one expired. */
    private suspend fun exchangeFor(account: Account): IssuedSessionDto? {
        val cached = idToken(account.uid, false) ?: return null
        return try {
            exchange(request(account, cached))
        } catch (refused: HttpException) {
            if (refused.code() != UNAUTHORIZED) throw refused
            val fresh = idToken(account.uid, true) ?: return null
            exchange(request(account, fresh))
        }
    }

    private fun request(account: Account, idToken: String) = SessionRequestDto(
        deviceId = deviceId(),
        firebaseIdToken = idToken,
        learnerId = account.learner?.id,
    )

    /** A learner removed on another device comes back as none; one renamed there, with the new name. */
    private suspend fun follow(sent: ChosenLearner?, answered: LearnerDto?) {
        when {
            sent == null -> Unit
            answered == null -> learnerGone()
            answered.id == sent.id && answered.name != sent.name ->
                accounts.changeLearner(sent.id) { it.copy(name = answered.name) }
        }
    }

    private companion object {
        const val MILLIS = 1_000L
        const val UNAUTHORIZED = 401

        /** So a session cannot lapse during a long upload. */
        const val RENEW_MARGIN_MILLIS = 5 * 60 * 1_000L
    }
}

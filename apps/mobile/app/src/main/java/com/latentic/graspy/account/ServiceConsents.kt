package com.latentic.graspy.account

import com.latentic.graspy.auth.FreshSignIn

/**
 * Whether a parent has agreed to graspy teaching the learner this device learns as. A learner chosen on "Who's
 * learning?" is agreed for by then; one this device was already learning as when consent began is asked about here.
 */
class ServiceConsents(private val api: AccountApi, private val accounts: AccountStore) {
    /**
     * True when the account's list says a parent has agreed for the learner in use, and the device now knows it. A
     * learner the account no longer holds is left by their next session, not asked about here, as on the web.
     */
    suspend fun check(): Boolean {
        val inUse = accounts.account.value?.learner ?: return false
        val listed = api.learners().learners.firstOrNull { it.id == inUse.id }
        if (listed != null && listed.serviceConsent == null) return false
        markAgreed(inUse.id)
        return true
    }

    /** Records the parent's agreement for the learner in use. */
    suspend fun agree(consent: FreshSignIn) {
        val inUse = accounts.account.value?.learner ?: throw SessionRefusal("No learner is in use on this device")
        api.agree(inUse.id, ConsentProofDto(CONSENT_NOTICE_VERSION, consent.idToken))
        markAgreed(inUse.id)
    }

    /** Only while the device still learns as them: a learner left meanwhile stays left. */
    private fun markAgreed(learnerId: String) {
        accounts.changeLearner(learnerId) { it.copy(consented = true) }
    }
}

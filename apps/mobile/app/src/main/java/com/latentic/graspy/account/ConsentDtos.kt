package com.latentic.graspy.account

import kotlinx.serialization.Serializable

/** The version of the notices a parent is shown before agreeing; the API takes no other. */
const val CONSENT_NOTICE_VERSION = 1

/**
 * A parent's agreement, with the ID token of the sign-in that proves they are there. Sent with a new learner, or
 * alone for one already added. Printing it never shows the token.
 */
@Serializable
data class ConsentProofDto(val noticeVersion: Int, val firebaseIdToken: String) {
    override fun toString() = "ConsentProofDto(noticeVersion=$noticeVersion)"
}

/** The parent's consent to use graspy for a learner: which notice they were shown, and when they agreed. */
@Serializable
data class ServiceConsentDto(val noticeVersion: Int, val grantedAt: Long)

/** The parent's consent to keep a learner's voice recordings, as the learner list carries it. */
@Serializable
data class KeptRecordingsDto(val noticeVersion: Int, val retentionDays: Int)

package com.latentic.graspy.account

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * One of the account's learners, as the server lists them. The consents are null until a parent agreed, and in a
 * session's learner, which the server does not fill: only the account's list says who has agreed.
 */
@Serializable
data class LearnerDto(
    val id: String,
    val name: String,
    val createdAt: Long,
    val serviceConsent: ServiceConsentDto? = null,
    val voiceConsent: KeptRecordingsDto? = null,
)

@Serializable
data class SessionRequestDto(
    val deviceId: String,
    val firebaseIdToken: String,
    /** The learner the device learns as, once one was chosen. */
    val learnerId: String? = null,
)

/** A session the server issued. Without a learner it manages the account's learners only. */
@Serializable
data class IssuedSessionDto(
    val token: String,
    val expiresIn: Long,
    val signedIn: Boolean = false,
    val learner: LearnerDto? = null,
)

/** Exchanges a Firebase ID token for a graspy session. Called without a session of its own. */
interface SessionApi {
    @POST("api/session")
    suspend fun session(@Body request: SessionRequestDto): IssuedSessionDto
}

package com.latentic.graspy.collection.outbox

import com.latentic.graspy.collection.VoiceRefusal

data class NewSubmission(
    val ownerId: String,
    val participantId: String,
    val speakerId: String,
    val languagePair: String,
    val spokenLanguage: String?,
    val task: String,
    val topic: String,
    val promptId: String?,
    val consentScope: String,
    val planId: String? = null,
    val eventId: String? = null,
)

enum class SubmissionStatus {
    PENDING,
    UPLOADING,
    COMPLETED,
    FAILED,
}

enum class UploadDisposition {
    RETRY,
    PERMANENT_FAILURE,

    /** The session names no learner: the recording waits until its learner is chosen again. */
    WAIT_FOR_LEARNER,
}

/**
 * A recording leaves the phone only once graspy has marked or refused it, so every other failure, however often it
 * comes, sends it again. WorkManager spaces those tries, and nothing counts them: the server spaces its own attempts
 * at marking a turn (2 and 30 minutes apart) and says when to ask again.
 */
object UploadFailurePolicy {
    /**
     * A refusal the server named decides, whatever its status; an unnamed one goes by the status. A 4xx without the
     * voice API's own body ([fromGraspy]) came from something in the way, so the voice API gave no answer at all.
     */
    fun forHttp(statusCode: Int, fromGraspy: Boolean, refusal: VoiceRefusal? = null): UploadDisposition = when {
        statusCode < 500 && !fromGraspy -> forNetwork()
        refusal != null -> forRefusal(refusal)
        transient(statusCode) -> UploadDisposition.RETRY
        else -> UploadDisposition.PERMANENT_FAILURE
    }

    /** No answer from the voice API: the network, an answer it could not read, or a session it could not get. */
    fun forNetwork(): UploadDisposition = UploadDisposition.RETRY

    /**
     * `audio_not_ready` is final here: the phone's copy went once graspy took the audio, and graspy no longer has it,
     * so there is nothing to send again.
     */
    private fun forRefusal(refusal: VoiceRefusal): UploadDisposition = when (refusal) {
        VoiceRefusal.LEARNER_REQUIRED -> UploadDisposition.WAIT_FOR_LEARNER
        VoiceRefusal.AUDIO_NOT_READY, VoiceRefusal.STEP_NOT_OFFERED, VoiceRefusal.UNSUPPORTED_PROMPT,
        VoiceRefusal.IDEMPOTENCY_CONFLICT,
        -> UploadDisposition.PERMANENT_FAILURE
    }

    /** Busy, rate-limited or failing on graspy's side, or a refusal of the session rather than of the answer. */
    private fun transient(statusCode: Int) =
        statusCode in RETRYABLE_STATUSES || statusCode in SESSION_STATUSES || statusCode >= 500

    private val RETRYABLE_STATUSES = setOf(408, 425, 429)

    /** A 401 still refused after the session was renewed, or a 403: it goes again once the session is sorted. */
    private val SESSION_STATUSES = setOf(401, 403)
}

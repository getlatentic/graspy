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

object UploadFailurePolicy {
    const val MAX_ATTEMPTS = 5

    /**
     * A refusal the server named decides, whatever its status; an unnamed one goes by the status. A 4xx without the
     * voice API's own body ([fromGraspy]) came from something in the way, so the voice API gave no answer at all.
     */
    fun forHttp(statusCode: Int, attemptIndex: Int, fromGraspy: Boolean, refusal: VoiceRefusal? = null): UploadDisposition = when {
        statusCode < 500 && !fromGraspy -> forNetwork(attemptIndex)
        else -> when (refusal) {
            VoiceRefusal.LEARNER_REQUIRED -> UploadDisposition.WAIT_FOR_LEARNER
            VoiceRefusal.AUDIO_NOT_READY -> disposition(true, attemptIndex)
            VoiceRefusal.STEP_NOT_OFFERED, VoiceRefusal.UNSUPPORTED_PROMPT, VoiceRefusal.IDEMPOTENCY_CONFLICT ->
                UploadDisposition.PERMANENT_FAILURE
            null -> disposition(transient(statusCode), attemptIndex)
        }
    }

    private fun transient(statusCode: Int) =
        statusCode == 408 || statusCode == 425 || statusCode == 429 || statusCode >= 500

    fun forNetwork(attemptIndex: Int): UploadDisposition = disposition(true, attemptIndex)

    private fun disposition(transient: Boolean, attemptIndex: Int): UploadDisposition =
        if (transient && attemptIndex < MAX_ATTEMPTS - 1) {
            UploadDisposition.RETRY
        } else {
            UploadDisposition.PERMANENT_FAILURE
        }
}

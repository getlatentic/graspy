package com.latentic.graspy.collection.outbox

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
}

object UploadFailurePolicy {
    const val MAX_ATTEMPTS = 5

    fun forHttp(statusCode: Int, attemptIndex: Int): UploadDisposition {
        val transient = statusCode == 408 || statusCode == 425 || statusCode == 429 || statusCode >= 500
        return disposition(transient, attemptIndex)
    }

    fun forNetwork(attemptIndex: Int): UploadDisposition = disposition(true, attemptIndex)

    private fun disposition(transient: Boolean, attemptIndex: Int): UploadDisposition =
        if (transient && attemptIndex < MAX_ATTEMPTS - 1) {
            UploadDisposition.RETRY
        } else {
            UploadDisposition.PERMANENT_FAILURE
        }
}

package com.latentic.graspy.collection.outbox

import com.latentic.graspy.collection.CompletedRecording
import java.io.File
import java.util.UUID
import kotlinx.coroutines.flow.Flow

class SubmissionRepository(
    private val dao: SubmissionDao,
    private val scheduler: SubmissionScheduler,
    private val idFactory: () -> String = { UUID.randomUUID().toString() },
    private val clock: () -> Long = System::currentTimeMillis,
) {
    suspend fun enqueue(
        submission: NewSubmission,
        recording: CompletedRecording,
    ): String {
        require(File(recording.path).isFile) { "completed recording does not exist" }
        require(submission.languagePair in SUPPORTED_LANGUAGE_PAIRS) {
            "unsupported language pair: ${submission.languagePair}"
        }
        val localId = idFactory()
        dao.insert(
            SubmissionEntity(
                localId = localId,
                ownerId = submission.ownerId,
                participantId = submission.participantId,
                idempotencyKey = idFactory(),
                audioPath = recording.path,
                speakerId = submission.speakerId,
                languagePair = submission.languagePair,
                spokenLanguage = submission.spokenLanguage,
                task = submission.task,
                topic = submission.topic,
                promptId = submission.promptId,
                consentScope = submission.consentScope,
                status = SubmissionStatus.PENDING.name,
                serverSampleId = null,
                uploadPath = null,
                failureReason = null,
                transcript = null,
                parsedAnswer = null,
                decision = null,
                feedback = null,
                provider = null,
                latencyMs = null,
                resultJson = null,
                attemptCount = 0,
                createdAtEpochMillis = clock(),
                planId = submission.planId,
                eventId = submission.eventId,
            ),
        )
        scheduler.schedule(localId)
        return localId
    }

    /** Re-queue a permanently failed submission; the stored idempotency key makes the retry safe. */
    suspend fun retry(localId: String) {
        dao.markPending(localId, "retry requested")
        scheduler.schedule(localId)
    }

    suspend fun recoverIncomplete(ownerId: String) {
        dao.findIncomplete(ownerId).forEach { scheduler.schedule(it.localId) }
    }

    fun observe(localId: String): Flow<SubmissionEntity?> = dao.observe(localId)

    private companion object {
        val SUPPORTED_LANGUAGE_PAIRS = setOf("yo-en", "pcm-en")
    }
}

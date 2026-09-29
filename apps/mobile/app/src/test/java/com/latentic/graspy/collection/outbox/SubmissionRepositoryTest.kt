package com.latentic.graspy.collection.outbox

import com.latentic.graspy.collection.CompletedRecording
import java.nio.file.Files
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import org.junit.Assert.assertEquals
import org.junit.Test

class SubmissionRepositoryTest {
    @Test
    fun `submission is persisted before upload work is scheduled`() = runBlocking {
        val events = mutableListOf<String>()
        val dao = FakeSubmissionDao(events)
        val repository = SubmissionRepository(
            dao = dao,
            scheduler = SubmissionScheduler { events += "schedule:$it" },
            idFactory = listOf("local-1", "key-1").iterator()::next,
            clock = { 123L },
        )
        val audio = Files.createTempFile("graspy", ".wav").toFile()

        val localId = repository.enqueue(validSubmission, CompletedRecording(audio.absolutePath))

        assertEquals("local-1", localId)
        assertEquals(listOf("insert:local-1", "schedule:local-1"), events)
        assertEquals("key-1", dao.submission?.idempotencyKey)
        assertEquals(SubmissionStatus.PENDING.name, dao.submission?.status)
    }

    @Test
    fun `startup recovery schedules only the signed in owners incomplete submissions`() = runBlocking {
        val scheduled = mutableListOf<String>()
        val dao = FakeSubmissionDao(mutableListOf()).apply {
            incomplete = listOf(entity("one"), entity("two"),
                entity("other").copy(ownerId = "other-owner"), entity("legacy").copy(ownerId = null))
        }
        val repository = SubmissionRepository(dao, SubmissionScheduler { scheduled += it })

        repository.recoverIncomplete("owner")

        assertEquals(listOf("one", "two"), scheduled)
    }

    private class FakeSubmissionDao(
        private val events: MutableList<String>,
    ) : SubmissionDao {
        var submission: SubmissionEntity? = null
        var incomplete: List<SubmissionEntity> = emptyList()

        override suspend fun insert(submission: SubmissionEntity) {
            this.submission = submission
            events += "insert:${submission.localId}"
        }

        override suspend fun find(localId: String) = submission?.takeIf { it.localId == localId }

        override fun observe(localId: String): Flow<SubmissionEntity?> = flowOf(
            submission?.takeIf { it.localId == localId },
        )

        override suspend fun findIncomplete(ownerId: String) = incomplete.filter { it.ownerId == ownerId }

        override fun observeIncomplete(ownerId: String): Flow<List<SubmissionEntity>> = flowOf(incomplete.filter { it.ownerId == ownerId })

        override fun observeLessonTurns(ownerId: String): Flow<List<SubmissionEntity>> = flowOf(incomplete.filter { it.ownerId == ownerId })

        override fun observeIncompleteCount(ownerId: String): Flow<Int> = flowOf(incomplete.count { it.ownerId == ownerId })

        override suspend fun holdsAny(ownerId: String) = submission?.ownerId == ownerId || incomplete.any { it.ownerId == ownerId }

        override suspend fun claim(uid: String, learnerKey: String) = Unit

        override suspend fun keepOnly(ownerId: String) = Unit

        override suspend fun markUploading(localId: String) = Unit

        override suspend fun markCreated(localId: String, serverSampleId: String, uploadPath: String?) = Unit

        override suspend fun markPending(localId: String, reason: String) {
            events += "pending:$localId"
        }

        override suspend fun markCompleted(
            localId: String,
            serverSampleId: String,
            transcript: String,
            parsedAnswer: Int?,
            decision: String,
            feedback: String,
            provider: String,
            latencyMs: Int,
            resultJson: String?,
        ) = Unit

        override suspend fun markFailed(localId: String, reason: String) = Unit
        override suspend fun markFeedbackHeard(localId: String) = Unit
        override suspend fun acknowledgeResult(localId: String) = Unit
        override suspend fun unsentAudioPaths() = listOfNotNull(submission?.audioPath) + incomplete.map { it.audioPath }
    }

    private companion object {
        val validSubmission = NewSubmission(
            ownerId = "owner",
            participantId = "participant-1",
            speakerId = "speaker-1",
            languagePair = "yo-en",
            spokenLanguage = null,
            task = "reasoning",
            topic = "multiplication",
            promptId = "seven-times-eight",
            consentScope = "voice_lesson",
        )

        fun entity(localId: String) = SubmissionEntity(
            ownerId = "owner",
            localId = localId,
            participantId = "participant-1",
            idempotencyKey = "key-$localId",
            audioPath = "/tmp/$localId.wav",
            speakerId = "speaker-1",
            languagePair = "yo-en",
            spokenLanguage = null,
            task = "reasoning",
            topic = "multiplication",
            promptId = null,
            consentScope = "voice_lesson",
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
            createdAtEpochMillis = 1,
        )
    }
}

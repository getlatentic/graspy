package com.latentic.graspy.collection.outbox

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface SubmissionDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(submission: SubmissionEntity)

    @Query("SELECT * FROM submissions WHERE localId = :localId")
    suspend fun find(localId: String): SubmissionEntity?

    @Query("SELECT * FROM submissions WHERE localId = :localId")
    fun observe(localId: String): Flow<SubmissionEntity?>

    @Query("SELECT * FROM submissions WHERE ownerId = :ownerId AND status IN ('PENDING', 'UPLOADING') ORDER BY createdAtEpochMillis")
    suspend fun findIncomplete(ownerId: String): List<SubmissionEntity>

    @Query("SELECT * FROM submissions WHERE ownerId = :ownerId AND status IN ('PENDING', 'UPLOADING') ORDER BY createdAtEpochMillis")
    fun observeIncomplete(ownerId: String): Flow<List<SubmissionEntity>>

    @Query("SELECT * FROM submissions WHERE ownerId = :ownerId AND (promptId LIKE 'mul_table_%' OR promptId LIKE 'mul_fact_%' OR promptId LIKE 'plan.%') ORDER BY createdAtEpochMillis, localId")
    fun observeLessonTurns(ownerId: String): Flow<List<SubmissionEntity>>

    @Query("SELECT COUNT(*) FROM submissions WHERE ownerId = :ownerId AND status IN ('PENDING', 'UPLOADING')")
    fun observeIncompleteCount(ownerId: String): Flow<Int>

    @Query("SELECT EXISTS(SELECT 1 FROM submissions WHERE ownerId = :ownerId)")
    suspend fun holdsAny(ownerId: String): Boolean

    /** Every recording a submission holds, whoever it belongs to. */
    @Query("SELECT audioPath FROM submissions")
    suspend fun audioPaths(): List<String>

    /** The rows an account kept before it held learners become the learner's. */
    @Query("UPDATE submissions SET ownerId = :learnerKey WHERE ownerId = :uid")
    suspend fun claim(uid: String, learnerKey: String)

    @Query("DELETE FROM submissions WHERE ownerId IS NULL OR ownerId != :ownerId")
    suspend fun keepOnly(ownerId: String)

    @Query(
        """UPDATE submissions
           SET status = 'UPLOADING', attemptCount = attemptCount + 1, failureReason = NULL
           WHERE localId = :localId""",
    )
    suspend fun markUploading(localId: String)

    @Query(
        """UPDATE submissions
           SET serverSampleId = :serverSampleId, uploadPath = :uploadPath
           WHERE localId = :localId""",
    )
    suspend fun markCreated(localId: String, serverSampleId: String, uploadPath: String?)

    @Query(
        """UPDATE submissions
           SET status = 'PENDING', failureReason = :reason
           WHERE localId = :localId""",
    )
    suspend fun markPending(localId: String, reason: String)

    @Query(
        """UPDATE submissions
           SET status = 'COMPLETED', serverSampleId = :serverSampleId,
               transcript = :transcript, parsedAnswer = :parsedAnswer,
               decision = :decision, feedback = :feedback, provider = :provider,
               latencyMs = :latencyMs, resultJson = :resultJson,
               failureReason = NULL
           WHERE localId = :localId""",
    )
    suspend fun markCompleted(
        localId: String,
        serverSampleId: String,
        transcript: String,
        parsedAnswer: Int?,
        decision: String,
        feedback: String,
        provider: String,
        latencyMs: Int,
        resultJson: String?,
    )

    @Query(
        """UPDATE submissions
           SET status = 'FAILED', failureReason = :reason
           WHERE localId = :localId""",
    )
    suspend fun markFailed(localId: String, reason: String)

    @Query("UPDATE submissions SET feedbackHeard = 1 WHERE localId = :localId")
    suspend fun markFeedbackHeard(localId: String)

    @Query("UPDATE submissions SET resultAcknowledged = 1 WHERE localId = :localId")
    suspend fun acknowledgeResult(localId: String)
}

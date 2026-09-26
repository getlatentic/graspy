package com.latentic.graspy.account

import com.latentic.graspy.collection.outbox.SubmissionDao
import com.latentic.graspy.collection.outbox.SubmissionRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/** Whether everything a learner recorded on this device has reached graspy. */
fun interface Outbox {
    suspend fun flush(learnerKey: String): Boolean
}

/**
 * Sends the learner's recordings still waiting in the outbox and waits for graspy to take them.
 * Offline, or still waiting after [patienceMillis], they have not all reached graspy.
 */
class RecordingOutbox(
    private val dao: SubmissionDao,
    private val repository: SubmissionRepository,
    private val online: suspend () -> Boolean,
    private val patienceMillis: Long = FLUSH_PATIENCE_MILLIS,
) : Outbox {
    override suspend fun flush(learnerKey: String): Boolean {
        if (!online()) return false
        repository.recoverIncomplete(learnerKey)
        return withTimeoutOrNull(patienceMillis) {
            dao.observeIncompleteCount(learnerKey).first { it == 0 }
        } != null
    }

    private companion object {
        /** Marking one answer takes seconds; a queue that has not moved in this long is not moving. */
        const val FLUSH_PATIENCE_MILLIS = 45_000L
    }
}

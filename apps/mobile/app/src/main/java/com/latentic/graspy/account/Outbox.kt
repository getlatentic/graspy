package com.latentic.graspy.account

import android.util.Log
import com.latentic.graspy.collection.outbox.SubmissionDao
import com.latentic.graspy.collection.outbox.SubmissionRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/** Whether everything a learner did on this device has reached graspy, once sent. */
fun interface Outbox {
    suspend fun flush(learnerKey: String): Boolean
}

/**
 * Everything a learner did here that graspy has yet to take, as the web's flushUnsent reads it: their voice
 * answers and their views' calls, each sent first. The plan is not among them: the phone sends each change to
 * it at once. Offline, or when any of it fails, not everything has reached graspy.
 */
class UnsentWork(private val online: suspend () -> Boolean, private val outboxes: List<Outbox>) : Outbox {
    override suspend fun flush(learnerKey: String): Boolean {
        if (!online()) return false
        return coroutineScope { outboxes.map { async { flushed(it, learnerKey) } }.awaitAll() }.all { it }
    }

    private suspend fun flushed(outbox: Outbox, learnerKey: String): Boolean = try {
        outbox.flush(learnerKey)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (error: Exception) {
        Log.w(TAG, "Sending what is unsent failed", error)
        false
    }

    private companion object {
        const val TAG = "GraspyUnsent"
    }
}

/**
 * Sends the learner's recordings still waiting in the outbox and waits for graspy to take them. One settled,
 * marked or refused, has reached graspy even while it waits to be shown. Still waiting after [patienceMillis],
 * they have not all reached graspy.
 */
class RecordingOutbox(
    private val dao: SubmissionDao,
    private val repository: SubmissionRepository,
    private val patienceMillis: Long = FLUSH_PATIENCE_MILLIS,
) : Outbox {
    override suspend fun flush(learnerKey: String): Boolean {
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

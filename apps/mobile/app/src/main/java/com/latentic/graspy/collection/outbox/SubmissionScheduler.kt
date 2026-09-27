package com.latentic.graspy.collection.outbox

import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.await
import java.util.concurrent.TimeUnit

fun interface SubmissionScheduler {
    fun schedule(localId: String)

    /** Tries it at once, cutting short the backoff an earlier failed try left it waiting out. */
    fun now(localId: String) = schedule(localId)
}

/** Sends a recording again once the wait the server named is over. Returns once that next try is stored. */
interface SubmissionRetry {
    suspend fun after(localId: String, waitMillis: Long)
}

class WorkManagerSubmissionScheduler(
    private val workManager: WorkManager,
) : SubmissionScheduler, SubmissionRetry {
    override fun schedule(localId: String) {
        workManager.enqueueUniqueWork(workName(localId), ExistingWorkPolicy.KEEP, request(localId, 0))
    }

    override fun now(localId: String) {
        workManager.enqueueUniqueWork(workName(localId), ExistingWorkPolicy.REPLACE, request(localId, 0))
    }

    /**
     * Asked from the recording's own running try, so the next try follows it on the same unique work. Being a new
     * request, its backoff starts over rather than growing with every wait the server asked for. Awaited, so the
     * running try ends only once its successor is stored and a process lost in between loses no wait.
     */
    override suspend fun after(localId: String, waitMillis: Long) {
        workManager.enqueueUniqueWork(workName(localId), ExistingWorkPolicy.APPEND_OR_REPLACE, request(localId, waitMillis))
            .await()
    }

    private fun request(localId: String, delayMillis: Long): OneTimeWorkRequest =
        OneTimeWorkRequestBuilder<SubmissionUploadWorker>()
            .setInputData(Data.Builder().putString(SubmissionUploadWorker.LOCAL_ID, localId).build())
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setInitialDelay(delayMillis, TimeUnit.MILLISECONDS)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build()

    private fun workName(localId: String) = "sample-submission-$localId"
}

package com.latentic.graspy.collection.outbox

import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

fun interface SubmissionScheduler {
    fun schedule(localId: String)
}

/** Sends a recording again once the wait the server named is over. */
fun interface SubmissionRetry {
    fun after(localId: String, waitMillis: Long)
}

class WorkManagerSubmissionScheduler(
    private val workManager: WorkManager,
) : SubmissionScheduler, SubmissionRetry {
    override fun schedule(localId: String) {
        workManager.enqueueUniqueWork(workName(localId), ExistingWorkPolicy.KEEP, request(localId, 0))
    }

    /**
     * Asked from the recording's own running try, so the next try follows it on the same unique work. Being a new
     * request, its backoff starts over rather than growing with every wait the server asked for.
     */
    override fun after(localId: String, waitMillis: Long) {
        workManager.enqueueUniqueWork(workName(localId), ExistingWorkPolicy.APPEND_OR_REPLACE, request(localId, waitMillis))
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

package com.latentic.graspy.collection.outbox

import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

fun interface SubmissionScheduler {
    fun schedule(localId: String)
}

class WorkManagerSubmissionScheduler(
    private val workManager: WorkManager,
) : SubmissionScheduler {
    override fun schedule(localId: String) {
        val request = OneTimeWorkRequestBuilder<SubmissionUploadWorker>()
            .setInputData(Data.Builder().putString(SubmissionUploadWorker.LOCAL_ID, localId).build())
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build()
        workManager.enqueueUniqueWork(workName(localId), ExistingWorkPolicy.KEEP, request)
    }

    private fun workName(localId: String) = "sample-submission-$localId"
}

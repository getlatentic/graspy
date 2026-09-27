package com.latentic.graspy.collection.outbox

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

/** Sends one recorded answer, named by [LOCAL_ID], through [SubmissionUpload]. */
class SubmissionUploadWorker(
    appContext: Context,
    params: WorkerParameters,
    private val upload: SubmissionUpload,
) : CoroutineWorker(appContext, params) {
    constructor(appContext: Context, params: WorkerParameters) : this(appContext, params, appUpload(appContext))

    override suspend fun doWork(): Result {
        val localId = inputData.getString(LOCAL_ID) ?: return Result.failure()
        return upload.send(localId)
    }

    companion object {
        const val LOCAL_ID = "local_id"
    }
}

private fun appUpload(context: Context): SubmissionUpload {
    val account = AppGraph.account(context)
    return SubmissionUpload(
        dao = AppGraph.database(context).submissionDao(),
        learnerInUse = account::learnerInUse,
        apiFor = { ownerId -> AppGraph.sampleApiFor(context, ownerId) },
        profiles = account.profiles,
        retry = AppGraph.submissionRetry(context),
        lessons = AppGraph.lessonRefreshScheduler(context),
    )
}

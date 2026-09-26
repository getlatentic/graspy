package com.latentic.graspy.sync

import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import com.latentic.graspy.localization.AppLanguage
import java.util.concurrent.TimeUnit

/** What one refresh needs to ask the Worker: whose lessons, for which class, read in which language. */
data class LessonRefreshRequest(
    val ownerId: String,
    val learnerClass: String,
    val language: AppLanguage,
    /** The lesson the learner opened for themselves; null lets the teacher choose. */
    val planId: String? = null,
)

fun interface LessonRefreshScheduler {
    fun refresh(request: LessonRefreshRequest)
}

/** One refresh per learner. The shared name is what makes repeated requests coalesce into one. */
fun lessonRefreshWorkName(ownerId: String): String = "lesson-refresh-$ownerId"

/**
 * Expedited: a learner is watching the screen this fills. Replacing rather than keeping the running
 * attempt matters because every trigger means the running attempt started before the change it must
 * pick up.
 */
fun lessonRefreshWork(request: LessonRefreshRequest): OneTimeWorkRequest =
    OneTimeWorkRequestBuilder<LessonRefreshWorker>()
        .setInputData(
            Data.Builder()
                .putString(LessonRefreshWorker.OWNER_ID, request.ownerId)
                .putString(LessonRefreshWorker.LEARNER_CLASS, request.learnerClass)
                .putString(LessonRefreshWorker.LANGUAGE, request.language.name)
                .putString(LessonRefreshWorker.PLAN_ID, request.planId)
                .build(),
        )
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
        .build()

private const val BACKOFF_SECONDS = 10L

class WorkManagerLessonRefreshScheduler(
    private val workManager: WorkManager,
) : LessonRefreshScheduler {
    override fun refresh(request: LessonRefreshRequest) {
        workManager.enqueueUniqueWork(
            lessonRefreshWorkName(request.ownerId),
            ExistingWorkPolicy.REPLACE,
            lessonRefreshWork(request),
        )
    }
}

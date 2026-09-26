package com.latentic.graspy.sync

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.latentic.graspy.R
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.copyFor
import com.latentic.graspy.practice.spokenLanguage
import java.io.IOException
import retrofit2.HttpException

/** Fills the learner's stored catalogue and current step from the Worker. Nothing on screen waits for it. */
class LessonRefreshWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val ownerId = inputData.getString(OWNER_ID) ?: return Result.failure()
        val learnerClass = inputData.getString(LEARNER_CLASS) ?: return Result.failure()
        val language = inputData.getString(LANGUAGE) ?: return Result.failure()
        if (AppGraph.account(applicationContext).learnerInUse() != ownerId) return Result.success()

        val api = AppGraph.sampleApiFor(applicationContext, ownerId)
        val dao = AppGraph.database(applicationContext).lessonCacheDao()
        val spoken = AppLanguage.valueOf(language).spokenLanguage()
        return try {
            val catalogue = api.catalogue(learnerClass, spoken)
            val move = api.lessonMove(learnerClass, spoken, inputData.getString(PLAN_ID))
            val fetchedAt = System.currentTimeMillis()
            // The device may have taken another learner while this one's lessons were on their way.
            if (AppGraph.account(applicationContext).learnerInUse() != ownerId) return Result.success()
            dao.replaceCatalogue(
                ownerId,
                learnerClass,
                catalogue.toStoredLessons(ownerId, learnerClass, fetchedAt),
            )
            dao.saveLessonMove(move.toStoredMove(ownerId, learnerClass, fetchedAt))
            Result.success()
        } catch (error: IOException) {
            Log.i(TAG, "The lesson refresh could not reach the Worker", error)
            if (runAttemptCount < MAX_ATTEMPTS - 1) Result.retry() else Result.failure()
        } catch (error: HttpException) {
            Log.e(TAG, "The Worker refused the lesson refresh with HTTP ${error.code()}", error)
            Result.failure()
        }
    }

    /** Android 11 and below run expedited work in the foreground, and ask what to show while it does. */
    override suspend fun getForegroundInfo(): ForegroundInfo {
        val language = AppLanguage.valueOf(requireNotNull(inputData.getString(LANGUAGE)))
        val notifications = requireNotNull(applicationContext.getSystemService(NotificationManager::class.java))
        notifications.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW),
        )
        val notification = Notification.Builder(applicationContext, CHANNEL_ID)
            .setContentTitle(copyFor(language).home.loading)
            .setSmallIcon(R.drawable.ic_sprout)
            .setOngoing(true)
            .build()
        return ForegroundInfo(NOTIFICATION_ID, notification)
    }

    companion object {
        const val OWNER_ID = "owner_id"
        const val LEARNER_CLASS = "learner_class"
        const val LANGUAGE = "language"
        const val PLAN_ID = "plan_id"
        private const val TAG = "GraspySync"
        private const val MAX_ATTEMPTS = 4
        private const val CHANNEL_ID = "graspy-lesson-refresh"
        private const val CHANNEL_NAME = "Lessons"
        private const val NOTIFICATION_ID = 4201
    }
}

package com.latentic.graspy.collection.outbox

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.ListenableWorker
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.WorkManagerTestInitHelper
import androidx.work.testing.WorkManagerTestInitHelper.ExecutorsMode
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.shadows.ShadowLooper

/** A recording still being marked is asked after when the server said, as the web asks after `retry_after_ms`. */
@RunWith(RobolectricTestRunner::class)
class SubmissionSchedulerTest {
    private val application: Application = ApplicationProvider.getApplicationContext()
    private val work get() = WorkManager.getInstance(application)
    private val scheduler get() = WorkManagerSubmissionScheduler(work)

    /** WorkManager's own threads, as on a phone: a try is never run on the thread that must store its successor. */
    @Before
    fun workManager() {
        val configuration = Configuration.Builder().setWorkerFactory(AskingAgain).build()
        WorkManagerTestInitHelper.initializeTestWorkManager(application, configuration, ExecutorsMode.PRESERVE_EXECUTORS)
    }

    @Test
    fun `the next try waits as long as the server asked`() = runBlocking {
        scheduler.after("local-1", TWO_MINUTES)

        val waiting = tries("local-1").single()
        assertEquals(WorkInfo.State.ENQUEUED, waiting.state)
        assertEquals(TWO_MINUTES, waiting.initialDelayMillis)
    }

    @Test
    fun `sending kept recordings again does not cut the server's wait short`() = runBlocking {
        scheduler.after("local-2", TWO_MINUTES)

        scheduler.schedule("local-2")

        assertEquals(listOf(TWO_MINUTES), tries("local-2").map { it.initialDelayMillis })
    }

    @Test
    fun `sending now does not wait out the backoff a failed try left`() = runBlocking {
        scheduler.after("local-4", TWO_MINUTES)

        scheduler.now("local-4")

        assertEquals(listOf(0L), tries("local-4").filterNot { it.state.isFinished }.map { it.initialDelayMillis })
    }

    @Test
    fun `a try asking again from inside itself queues the next try behind itself`() {
        scheduler.schedule("local-3")
        val running = tries("local-3").single()

        WorkManagerTestInitHelper.getTestDriver(application)!!.setAllConstraintsMet(running.id)
        awaitFinished(running.id)

        assertEquals(
            listOf(WorkInfo.State.SUCCEEDED to 0L, WorkInfo.State.ENQUEUED to TWO_MINUTES),
            tries("local-3").map { it.state to it.initialDelayMillis }.sortedBy { it.second },
        )
    }

    private fun tries(localId: String): List<WorkInfo> = work.getWorkInfosForUniqueWork("sample-submission-$localId").get()

    private fun awaitFinished(id: UUID) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
        while (work.getWorkInfoById(id).get()?.state?.isFinished != true) {
            check(System.nanoTime() < deadline) { "the try never finished" }
            ShadowLooper.idleMainLooper()
            Thread.sleep(20)
        }
    }

    /** A try the server answers "still marking, ask in two minutes", asking again as [SubmissionUpload] does. */
    private object AskingAgain : WorkerFactory() {
        override fun createWorker(appContext: Context, workerClassName: String, workerParameters: WorkerParameters): ListenableWorker =
            object : Worker(appContext, workerParameters) {
                override fun doWork(): Result = runBlocking {
                    val localId = requireNotNull(inputData.getString(SubmissionUploadWorker.LOCAL_ID))
                    WorkManagerSubmissionScheduler(WorkManager.getInstance(applicationContext)).after(localId, TWO_MINUTES)
                    Result.success()
                }
            }
    }

    private companion object {
        const val TWO_MINUTES = 2 * 60 * 1000L
    }
}

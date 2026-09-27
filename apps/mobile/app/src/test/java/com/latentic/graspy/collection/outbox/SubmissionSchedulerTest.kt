package com.latentic.graspy.collection.outbox

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkManager
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A recording still being marked is asked after when the server said, as the web asks after `retry_after_ms`. */
@RunWith(RobolectricTestRunner::class)
class SubmissionSchedulerTest {
    private val application: Application = ApplicationProvider.getApplicationContext()
    private val work get() = WorkManager.getInstance(application)
    private val scheduler get() = WorkManagerSubmissionScheduler(work)

    @Before
    fun workManager() {
        if (!WorkManager.isInitialized()) WorkManager.initialize(application, Configuration.Builder().setExecutor { it.run() }.build())
    }

    @Test
    fun `the next try waits as long as the server asked`() {
        scheduler.after("local-1", TWO_MINUTES)

        val waiting = tries("local-1").single()
        assertEquals(WorkInfo.State.ENQUEUED, waiting.state)
        assertEquals(TWO_MINUTES, waiting.initialDelayMillis)
    }

    @Test
    fun `sending kept recordings again does not cut the server's wait short`() {
        scheduler.after("local-2", TWO_MINUTES)

        scheduler.schedule("local-2")

        assertEquals(listOf(TWO_MINUTES), tries("local-2").map { it.initialDelayMillis })
    }

    private fun tries(localId: String): List<WorkInfo> = work.getWorkInfosForUniqueWork("sample-submission-$localId").get()

    private companion object {
        const val TWO_MINUTES = 2 * 60 * 1000L
    }
}

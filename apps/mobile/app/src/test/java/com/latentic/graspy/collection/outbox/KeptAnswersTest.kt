package com.latentic.graspy.collection.outbox

import com.latentic.graspy.account.RecordingOutbox
import com.latentic.graspy.account.answer
import com.latentic.graspy.account.inMemoryDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A leave waits for the learner's kept answers to be tried once, as the web's sentEveryAnswer sends each once, and
 * asks at once about one whose try failed instead of waiting out its patience on an answer that may never go.
 */
@RunWith(RobolectricTestRunner::class)
class KeptAnswersTest {
    private val database = inMemoryDatabase()
    private val dao = database.submissionDao()
    private val trying = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** What each try does to its answer, as [SubmissionUpload] would. */
    private var tryOf: suspend (String) -> Unit = {}
    private val tries = Tries()
    private val outbox = RecordingOutbox(dao, SubmissionRepository(dao, tries), patienceMillis = PATIENCE)

    @After
    fun close() {
        trying.cancel()
        database.close()
    }

    @Test
    fun `an answer whose try failed is not waited for`() = runBlocking {
        dao.insert(answer("failing", ADA_KEY))
        tryOf = { localId -> dao.markUploading(localId); dao.markPending(localId, "sample API returned HTTP 500") }

        val asked = System.nanoTime()
        assertFalse(outbox.flush(ADA_KEY))

        assertTrue("waited out its patience", System.nanoTime() - asked < PATIENCE * 1_000_000 / 2)
    }

    @Test
    fun `an answer still being marked is waited for until it is marked`() = runBlocking {
        dao.insert(answer("marking", ADA_KEY))
        tryOf = { localId ->
            dao.markUploading(localId)
            dao.markPending(localId, STILL_BEING_CHECKED)
            delay(100)
            dao.markFailed(localId, "no_speech")
        }

        assertTrue(outbox.flush(ADA_KEY))
    }

    @Test
    fun `an answer that failed before the leave is tried at once, not after its backoff`() = runBlocking {
        dao.insert(answer("failed-earlier", ADA_KEY).copy(attemptCount = 3, failureReason = "sample API returned HTTP 503"))
        tries.backingOff += "failed-earlier"
        tryOf = { localId -> delay(100); dao.markUploading(localId); dao.markFailed(localId, "no_speech") }

        assertTrue(outbox.flush(ADA_KEY))
    }

    @Test
    fun `an answer failing on every try is asked about once its fresh try fails`() = runBlocking {
        dao.insert(answer("always-failing", ADA_KEY).copy(attemptCount = 3, failureReason = "sample API returned HTTP 500"))
        tries.backingOff += "always-failing"
        tryOf = { localId -> dao.markUploading(localId); dao.markPending(localId, "sample API returned HTTP 500") }

        val asked = System.nanoTime()
        assertFalse(outbox.flush(ADA_KEY))

        assertTrue("waited out its patience", System.nanoTime() - asked < PATIENCE * 1_000_000 / 2)
    }

    @Test
    fun `an answer still being marked keeps the server's wait`() = runBlocking {
        dao.insert(answer("waiting", ADA_KEY).copy(attemptCount = 1, failureReason = STILL_BEING_CHECKED))
        tries.backingOff += "waiting"

        assertFalse(RecordingOutbox(dao, SubmissionRepository(dao, tries), patienceMillis = 100).flush(ADA_KEY))
        assertTrue(tries.now.isEmpty())
    }

    @Test
    fun `an answer never tried within its patience has not reached graspy`() = runBlocking {
        dao.insert(answer("untried", ADA_KEY).copy(attemptCount = 3, failureReason = "sample API returned HTTP 503"))

        assertFalse(RecordingOutbox(dao, SubmissionRepository(dao, SubmissionScheduler { }), patienceMillis = 100).flush(ADA_KEY))
    }

    /** WorkManager's unique work: a plain schedule keeps a try waiting out its backoff; [now] replaces it. */
    private inner class Tries : SubmissionScheduler {
        val backingOff = mutableSetOf<String>()
        val now = mutableListOf<String>()

        override fun schedule(localId: String) {
            if (localId !in backingOff) run(localId)
        }

        override fun now(localId: String) {
            now += localId
            run(localId)
        }

        private fun run(localId: String) {
            trying.launch { tryOf(localId) }
        }
    }

    private companion object {
        const val ADA_KEY = "uid-1/aaaaaaaaaaaa"
        const val PATIENCE = 10_000L
    }
}

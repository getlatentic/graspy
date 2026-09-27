package com.latentic.graspy.account

import com.latentic.graspy.collection.outbox.SubmissionRepository
import com.latentic.graspy.collection.outbox.SubmissionScheduler
import com.latentic.graspy.collection.outbox.SubmissionStatus
import com.latentic.graspy.lesson.PLAN
import com.latentic.graspy.mcp.FakeGraspyServer
import com.latentic.graspy.mcp.HOLDS_EVERY_FILE
import com.latentic.graspy.mcp.KEPT_RESULT
import com.latentic.graspy.mcp.LearnerConnection
import com.latentic.graspy.plan.LearnerRecord
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.job
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonObject
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * What sign-out and a learner switch send first, and count as unsent when they cannot: the learner's kept voice
 * answers and their views' kept calls, as the web's flushUnsent does.
 */
@RunWith(RobolectricTestRunner::class)
class UnsentWorkTest {
    private val database = inMemoryDatabase()
    private val scheduled = mutableListOf<String>()
    private val recordings = RecordingOutbox(
        database.submissionDao(),
        SubmissionRepository(database.submissionDao(), SubmissionScheduler { scheduled += it }),
        patienceMillis = 100,
    )
    private val server = FakeGraspyServer(PLAN, LearnerRecord())
    private var reachable = false
    private val calls = OkHttpClient.Builder().addInterceptor { chain ->
        if (!reachable) throw IOException("no connection")
        chain.proceed(chain.request())
    }.build()
    private val connection = LearnerConnection(database, ADA_KEY, calls, server.web.url("/mcp"), HOLDS_EVERY_FILE) { true }
    private val viewCalls = Outbox { learnerKey -> LearnerConnection(database, learnerKey, calls, server.web.url("/mcp"), HOLDS_EVERY_FILE) { true }.sentEverything() }
    private var online = true
    private val sending = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val unsent = UnsentWork({ online }, listOf(recordings, viewCalls), sending)

    @After
    fun close() {
        sending.cancel()
        database.close()
        runCatching { server.web.shutdown() }
    }

    @Test
    fun `with nothing kept, everything has reached graspy`() = runBlocking {
        assertTrue(unsent.flush(ADA_KEY))
    }

    @Test
    fun `a kept voice answer is sent first, and holds the leave back while graspy has not taken it`() = runBlocking {
        database.submissionDao().insert(answer("waiting", ADA_KEY))

        assertFalse(unsent.flush(ADA_KEY))
        assertEquals(listOf("waiting"), scheduled)
    }

    @Test
    fun `watching a kept voice answer ends when the leave stops waiting for it`() = runBlocking {
        database.submissionDao().insert(answer("waiting", ADA_KEY))

        assertFalse(UnsentWork({ online }, listOf(recordings), sending, patienceMillis = 100).flush(ADA_KEY))
        withTimeout(1_000) { while (sending.coroutineContext.job.children.any()) delay(10) }
    }

    @Test
    fun `the voice answers are watched no longer than the leave waits for them`() {
        val unwatched = RecordingOutbox(database.submissionDao(), SubmissionRepository(database.submissionDao(), SubmissionScheduler {}))

        assertEquals(UnsentWork({ online }, listOf(unwatched), sending).patienceMillis, unwatched.patienceMillis)
    }

    @Test
    fun `a voice answer marked or refused, waiting only to be shown, has reached graspy`() = runBlocking {
        database.submissionDao().insert(answer("marked", ADA_KEY, SubmissionStatus.COMPLETED))
        database.submissionDao().insert(answer("refused", ADA_KEY, SubmissionStatus.FAILED))

        assertTrue(unsent.flush(ADA_KEY))
    }

    @Test
    fun `a view's kept call is sent first, and holds the leave back until graspy takes it`() = runBlocking {
        assertEquals(KEPT_RESULT, connection.call("lesson_progress", JsonObject(emptyMap())))

        assertFalse(unsent.flush(ADA_KEY))
        assertEquals(1, database.keptCallDao().kept(ADA_KEY).size)

        reachable = true
        assertTrue(unsent.flush(ADA_KEY))
        assertEquals(listOf("lesson_progress"), server.toolsCalled)
        assertTrue(database.keptCallDao().kept(ADA_KEY).isEmpty())
    }

    @Test
    fun `offline nothing is sent, and not everything has reached graspy`() = runBlocking {
        online = false
        var flushed = false

        assertFalse(UnsentWork({ online }, listOf(Outbox { flushed = true; true }), sending).flush(ADA_KEY))
        assertFalse(flushed)
    }

    @Test
    fun `past its patience, what is still being sent counts as unsent, and goes on being sent`() = runBlocking {
        val marking = CompletableDeferred<Unit>()
        val sent = CompletableDeferred<Unit>()
        val slow = Outbox { marking.await(); sent.complete(Unit); true }

        val asked = System.nanoTime()
        assertFalse(UnsentWork({ true }, listOf(slow), sending, patienceMillis = 50).flush(ADA_KEY))
        assertTrue("answered past its patience", System.nanoTime() - asked < 5_000_000_000L)

        marking.complete(Unit)
        withTimeout(5_000) { sent.await() }
    }

    @Test
    fun `a part that fails to send counts as unsent, and the others are still sent`() = runBlocking {
        var sent = false
        val failing = Outbox { throw IllegalStateException("the outbox could not be read") }

        assertFalse(UnsentWork({ true }, listOf(failing, Outbox { sent = true; true }), sending).flush(ADA_KEY))
        assertTrue(sent)
    }

    private companion object {
        const val ADA_KEY = "uid-1/aaaaaaaaaaaa"
    }
}

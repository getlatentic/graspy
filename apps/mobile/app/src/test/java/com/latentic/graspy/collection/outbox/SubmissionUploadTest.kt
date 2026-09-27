package com.latentic.graspy.collection.outbox

import androidx.work.ListenableWorker.Result
import com.latentic.graspy.account.answer
import com.latentic.graspy.account.context
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.collection.SampleApi
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.sync.LessonRefreshRequest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** One try at a recorded answer, against a voice API answering as apps/server/src/app/voice does. */
@RunWith(RobolectricTestRunner::class)
class SubmissionUploadTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val database = inMemoryDatabase()
    private val dao = database.submissionDao()
    private val server = MockWebServer()
    private val api = Retrofit.Builder()
        .baseUrl(server.url("/"))
        .client(OkHttpClient())
        .addConverterFactory(apiJson.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(SampleApi::class.java)
    private val nextTries = NextTries()
    private val refreshed = mutableListOf<LessonRefreshRequest>()
    private val upload = SubmissionUpload(
        dao = dao,
        learnerInUse = { ADA_KEY },
        apiFor = { api },
        profiles = LearnerProfileStore(context()),
        retry = nextTries,
        lessons = { refreshed += it },
    )

    @After
    fun close() {
        database.close()
        server.close()
    }

    @Test
    fun `an answer still being marked is asked after when the server said, behind this try`() = runBlocking {
        kept("waiting")
        server.enqueue(CREATED)
        server.enqueue(UPLOADED)
        server.enqueue(stillMarking(retryAfterMs = 120_000))

        assertEquals(Result.success(), upload.send("waiting"))

        assertEquals(listOf("waiting" to 120_000L), nextTries.stored)
        assertKept("waiting", STILL_BEING_CHECKED)
    }

    @Test
    fun `a wait shorter than the web's is stretched to three seconds`() = runBlocking {
        kept("hurried")
        server.enqueue(CREATED)
        server.enqueue(UPLOADED)
        server.enqueue(stillMarking(retryAfterMs = 500))

        assertEquals(Result.success(), upload.send("hurried"))

        assertEquals(listOf("hurried" to MIN_MARKING_WAIT_MILLIS), nextTries.stored)
    }

    @Test
    fun `still being marked with no wait named, the usual backoff asks again`() = runBlocking {
        kept("unnamed")
        server.enqueue(CREATED)
        server.enqueue(UPLOADED)
        server.enqueue(stillMarking(retryAfterMs = null))

        assertEquals(Result.retry(), upload.send("unnamed"))

        assertTrue(nextTries.stored.isEmpty())
        assertKept("unnamed", STILL_BEING_CHECKED)
    }

    @Test
    fun `the try ends only once the next one is stored`() = runBlocking {
        kept("stored")
        server.enqueue(CREATED)
        server.enqueue(UPLOADED)
        server.enqueue(stillMarking(retryAfterMs = 120_000))
        val storing = CompletableDeferred<Unit>()
        val stored = CompletableDeferred<Unit>()
        nextTries.storing = { storing.complete(Unit); stored.await() }

        val sent = async { upload.send("stored") }
        withTimeout(5_000) { storing.await() }

        assertFalse("ended before the next try was stored", sent.isCompleted)
        stored.complete(Unit)
        assertEquals(Result.success(), withTimeout(5_000) { sent.await() })
    }

    @Test
    fun `a next try that could not be stored leaves the answer to the usual backoff`() = runBlocking {
        kept("unstored")
        server.enqueue(CREATED)
        server.enqueue(UPLOADED)
        server.enqueue(stillMarking(retryAfterMs = 120_000))
        nextTries.storing = { throw IllegalStateException("WorkManager's database is locked") }

        assertEquals(Result.retry(), upload.send("unstored"))

        assertKept("unstored", STILL_BEING_CHECKED)
    }

    @Test
    fun `with no upload path named, the audio goes where the web sends it`() = runBlocking {
        kept("unnamed-path")
        server.enqueue(json("""{"sample_id":"gvm_1","state":"created"}"""))
        server.enqueue(UPLOADED)
        server.enqueue(json(MARKED))

        assertEquals(Result.success(), upload.send("unnamed-path"))

        assertEquals(
            listOf("POST /api/voice/samples", "PUT /api/voice/samples/gvm_1/audio", "POST /api/voice/samples/gvm_1/evaluation"),
            List(3) { server.takeRequest().let { "${it.method} ${it.path}" } },
        )
        assertEquals(SubmissionStatus.COMPLETED.name, dao.find("unnamed-path")?.status)
    }

    @Test
    fun `an answer whose reply could not be read is kept for another try`() = runBlocking {
        kept("unreadable")
        server.enqueue(CREATED)
        server.enqueue(UPLOADED)
        server.enqueue(json("""{"state":"complete"}"""))

        assertEquals(Result.retry(), upload.send("unreadable"))

        assertKept("unreadable", "sample API answer could not be read")
    }

    private suspend fun kept(localId: String) {
        val recording = folder.newFile("$localId.wav").apply { writeBytes("RIFF".toByteArray()) }
        dao.insert(answer(localId, ADA_KEY).copy(audioPath = recording.absolutePath))
    }

    private suspend fun assertKept(localId: String, reason: String) {
        val answer = dao.find(localId)
        assertEquals(SubmissionStatus.PENDING.name to reason, answer?.status to answer?.failureReason)
    }

    /** Stores each next try it is asked for, once [storing] lets it. */
    private class NextTries : SubmissionRetry {
        val stored = mutableListOf<Pair<String, Long>>()
        var storing: suspend () -> Unit = {}

        override suspend fun after(localId: String, waitMillis: Long) {
            storing()
            stored += localId to waitMillis
        }
    }

    private companion object {
        const val ADA_KEY = "uid-1/aaaaaaaaaaaa"
        const val MARKED = """{"sample_id":"gvm_1","state":"complete","transcript":"four","decision":"correct","feedback":"Yes","provider":"intron_sync","latency_ms":900}"""
        val CREATED: MockResponse get() = json("""{"sample_id":"gvm_1","state":"created","upload_path":"/api/voice/samples/gvm_1/audio"}""")
        val UPLOADED: MockResponse get() = json("""{"sample_id":"gvm_1","state":"ready"}""")

        fun stillMarking(retryAfterMs: Long?): MockResponse {
            val wait = retryAfterMs?.let { ""","retry_after_ms":$it""" }.orEmpty()
            return json("""{"sample_id":"gvm_1","state":"processing"$wait}""").setResponseCode(202)
        }

        fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)
    }
}

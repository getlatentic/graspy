package com.latentic.graspy.collection.outbox

import androidx.work.ListenableWorker.Result
import com.latentic.graspy.account.answer
import com.latentic.graspy.account.context
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.collection.SampleApi
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.sync.LessonRefreshRequest
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
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

    @Test
    fun `the recording leaves the phone once graspy has taken it, though the answer is still being marked`() = runBlocking {
        val recording = kept("taken")
        server.enqueue(CREATED)
        server.enqueue(UPLOADED)
        server.enqueue(stillMarking(retryAfterMs = 120_000))

        assertEquals(Result.success(), upload.send("taken"))

        assertFalse(recording.exists())
        assertKept("taken", STILL_BEING_CHECKED)
    }

    @Test
    fun `an answer asked after with its recording gone is marked without sending the audio again`() = runBlocking {
        kept("asked-after")
        server.enqueue(CREATED)
        server.enqueue(UPLOADED)
        server.enqueue(stillMarking(retryAfterMs = 120_000))
        upload.send("asked-after")
        requests(3)
        server.enqueue(json("""{"sample_id":"gvm_1","state":"ready","upload_path":null}"""))
        server.enqueue(json(MARKED))

        assertEquals(Result.success(), upload.send("asked-after"))

        assertEquals(listOf("POST /api/voice/samples", "POST /api/voice/samples/gvm_1/evaluation"), requests(2))
        assertEquals(SubmissionStatus.COMPLETED.name, dao.find("asked-after")?.status)
    }

    @Test
    fun `a sample graspy already holds is not sent again, and the phone's copy goes`() = runBlocking {
        val recording = kept("held")
        server.enqueue(json("""{"sample_id":"gvm_1","state":"ready","upload_path":null}"""))
        server.enqueue(json(MARKED))

        assertEquals(Result.success(), upload.send("held"))

        assertFalse(recording.exists())
        assertEquals(listOf("POST /api/voice/samples", "POST /api/voice/samples/gvm_1/evaluation"), requests(2))
    }

    @Test
    fun `a recording graspy has not taken stays for the next try, and goes when graspy takes it`() = runBlocking {
        val recording = kept("refused-upload")
        server.enqueue(CREATED)
        server.enqueue(MockResponse().setResponseCode(503))

        assertEquals(Result.retry(), upload.send("refused-upload"))

        assertTrue(recording.exists())
        assertKept("refused-upload", "sample API returned HTTP 503")
        server.enqueue(CREATED)
        server.enqueue(UPLOADED)
        server.enqueue(json(MARKED))
        assertEquals(Result.success(), upload.send("refused-upload"))
        assertFalse(recording.exists())
        assertEquals(SubmissionStatus.COMPLETED.name, dao.find("refused-upload")?.status)
    }

    @Test
    fun `a recording stays while graspy cannot be reached`() = runBlocking {
        val recording = kept("offline")
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

        assertEquals(Result.retry(), upload.send("offline"))

        assertTrue(recording.exists())
    }

    @Test
    fun `a take graspy refuses for good is dropped from the phone with its answer`() = runBlocking {
        val recording = kept("refused")
        server.enqueue(json("""{"detail":"prompt_id must be an activity the named lesson event can ask for"}""").setResponseCode(400))

        assertEquals(Result.failure(), upload.send("refused"))

        assertFalse(recording.exists())
        assertEquals(SubmissionStatus.FAILED.name, dao.find("refused")?.status)
    }

    @Test
    fun `an answer graspy could not mark is given up on, and no recording is left`() = runBlocking {
        val recording = kept("unmarkable")
        server.enqueue(CREATED)
        server.enqueue(UPLOADED)
        server.enqueue(json("""{"sample_id":"gvm_1","state":"complete"}"""))

        assertEquals(Result.failure(), upload.send("unmarkable"))

        assertFalse(recording.exists())
        assertEquals(SubmissionStatus.FAILED.name, dao.find("unmarkable")?.status)
    }

    @Test
    fun `audio graspy no longer has cannot be sent again, so the answer is given up on`() = runBlocking {
        kept("lost-at-graspy")
        server.enqueue(CREATED)
        server.enqueue(UPLOADED)
        server.enqueue(NOT_READY)

        assertEquals(Result.failure(), upload.send("lost-at-graspy"))

        assertEquals(SubmissionStatus.FAILED.name, dao.find("lost-at-graspy")?.status)
        assertEquals(3, server.requestCount)
    }

    @Test
    fun `a recording that is gone before graspy took it fails the answer`() = runBlocking {
        val recording = kept("vanished")
        recording.delete()

        assertEquals(Result.failure(), upload.send("vanished"))

        assertKeptAs("vanished", SubmissionStatus.FAILED, "recording file is missing")
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `a recording lost between graspy making the sample and taking the audio fails the answer`() = runBlocking {
        val recording = kept("lost-file")
        dao.markCreated("lost-file", "gvm_1", null)
        recording.delete()
        server.enqueue(CREATED)

        assertEquals(Result.failure(), upload.send("lost-file"))

        assertKeptAs("lost-file", SubmissionStatus.FAILED, "recording file is missing")
        assertEquals(1, server.requestCount)
    }

    /** The next [count] requests the server took, each waited for a few seconds at most. */
    private fun requests(count: Int): List<String> = List(count) {
        val request = requireNotNull(server.takeRequest(5, TimeUnit.SECONDS)) { "the server took fewer than $count requests" }
        "${request.method} ${request.path}"
    }

    private suspend fun kept(localId: String): File {
        val recording = folder.newFile("$localId.wav").apply { writeBytes("RIFF".toByteArray()) }
        dao.insert(answer(localId, ADA_KEY).copy(audioPath = recording.absolutePath))
        return recording
    }

    private suspend fun assertKeptAs(localId: String, status: SubmissionStatus, reason: String) {
        val answer = dao.find(localId)
        assertEquals(status.name to reason, answer?.status to answer?.failureReason)
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
        val NOT_READY: MockResponse get() = json("""{"detail":"sample audio is not ready","code":"audio_not_ready"}""").setResponseCode(409)

        fun stillMarking(retryAfterMs: Long?): MockResponse {
            val wait = retryAfterMs?.let { ""","retry_after_ms":$it""" }.orEmpty()
            return json("""{"sample_id":"gvm_1","state":"processing"$wait}""").setResponseCode(202)
        }

        fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)
    }
}

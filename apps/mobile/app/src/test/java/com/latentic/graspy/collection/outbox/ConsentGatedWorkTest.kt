package com.latentic.graspy.collection.outbox

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.ListenableWorker.Result
import androidx.work.WorkManager
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.workDataOf
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.Account
import com.latentic.graspy.account.ChosenLearner
import com.latentic.graspy.account.FakeAccountApi
import com.latentic.graspy.account.ServiceConsents
import com.latentic.graspy.account.UID
import com.latentic.graspy.account.answer
import com.latentic.graspy.account.demoFirebase
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.account.learnerKey
import com.latentic.graspy.auth.FreshSignIn
import com.latentic.graspy.collection.SampleApi
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.sync.LessonRefreshWorker
import java.io.File
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * A learner this phone had before consent, with an answer recorded and waiting, is not sent, refreshed or asked
 * about in the background until a parent has agreed. What waits stays on the phone, and goes once they have.
 */
@RunWith(RobolectricTestRunner::class)
class ConsentGatedWorkTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val application: Application = ApplicationProvider.getApplicationContext()
    private val graph get() = AppGraph.account(application)
    private val owner = learnerKey(UID, ADA.id)
    private val database = inMemoryDatabase()
    private val dao = database.submissionDao()
    private val server = MockWebServer()
    private val api = Retrofit.Builder()
        .baseUrl(server.url("/"))
        .client(OkHttpClient())
        .addConverterFactory(apiJson.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(SampleApi::class.java)

    private val upload get() = SubmissionUpload(
        dao = dao,
        learnerInUse = graph::learnerInUse,
        apiFor = { api },
        profiles = LearnerProfileStore(application),
        retry = object : SubmissionRetry {
            override suspend fun after(localId: String, waitMillis: Long) = Unit
        },
        lessons = {},
    )

    /** The learner from before consent: chosen on the device, with no agreement marked on it. */
    @Before
    fun anUpgradedLearnerWithAnAnswerWaiting() = runBlocking {
        demoFirebase()
        if (!WorkManager.isInitialized()) WorkManager.initialize(application, Configuration.Builder().setExecutor { it.run() }.build())
        graph.accounts.set(Account(UID, "parent@example.com", ChosenLearner(ADA.id, ADA.name, consented = false), deviceJoins = false))
        val recording = folder.newFile("waiting.wav").apply { writeBytes("RIFF".toByteArray()) }
        dao.insert(answer("waiting", owner).copy(audioPath = recording.absolutePath))
    }

    @After
    fun close() {
        graph.accounts.set(null)
        database.close()
        server.close()
    }

    private fun theParentAgrees() = runBlocking {
        ServiceConsents(FakeAccountApi(), graph.accounts).agree(FreshSignIn("fresh-id-token"))
    }

    @Test
    fun `no learner is in use for the background while their parent has not agreed`() {
        assertNull(graph.learnerInUse())
        assertEquals(false, graph.learnsAs(owner))
    }

    @Test
    fun `the outbox worker sends nothing of a learner whose parent has not agreed, and keeps the answer`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(500))

        assertEquals(Result.success(), upload.send("waiting"))

        assertEquals(0, server.requestCount)
        val kept = dao.find("waiting")
        assertEquals(SubmissionStatus.PENDING.name, kept?.status)
        assertTrue(File(kept?.audioPath.orEmpty()).isFile)
    }

    @Test
    fun `the same answer is sent once the parent has agreed`() = runBlocking {
        upload.send("waiting")
        assertEquals(0, server.requestCount)
        server.enqueue(MockResponse().setResponseCode(503))

        theParentAgrees()
        upload.send("waiting")

        assertTrue(server.requestCount > 0)
    }

    @Test
    fun `the lesson refresh worker asks graspy for nothing for a learner whose parent has not agreed`() = runBlocking {
        val worker = TestListenableWorkerBuilder<LessonRefreshWorker>(application)
            .setInputData(
                workDataOf(
                    LessonRefreshWorker.OWNER_ID to owner,
                    LessonRefreshWorker.LEARNER_CLASS to "primary_3",
                    LessonRefreshWorker.LANGUAGE to AppLanguage.ENGLISH.name,
                ),
            )
            .build()

        // A worker that went on to ask graspy would wait on a session that never comes: it fails here, and does not hang.
        assertEquals(Result.success(), withTimeoutOrNull(10_000) { worker.doWork() })
    }
}

package com.latentic.graspy.mcp

import com.latentic.graspy.account.SessionRefusal
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.lesson.CopiedLesson
import com.latentic.graspy.lesson.PLAN
import com.latentic.graspy.lesson.eventually
import com.latentic.graspy.lesson.topic
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.RecordRead
import com.latentic.graspy.plan.TopicMark
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The learner's connection wired as the app wires it, against a server that answers MCP and then goes
 * away: what was copied while it answered is there offline, the lesson and its view's page, on a phone
 * that never showed either. The page's own scripts are cached only once that view has loaded online.
 */
@RunWith(RobolectricTestRunner::class)
class LearnerConnectionTest {
    private val database = inMemoryDatabase()
    private val fractionsReady = LearnerRecord(topics = listOf(TopicMark("mathematics", 1, "Fractions", lessonId = "lesson-9")))
    private val server = FakeGraspyServer(PLAN, fractionsReady)
    private val endpoint = server.web.url("/mcp")
    private val calls = OkHttpClient()

    @After
    fun close() {
        database.close()
        runCatching { server.web.shutdown() }
    }

    @Test
    fun `a ready lesson copied when the plan loads opens with no connection, view and content`() = runBlocking {
        val online = connection()
        val copier = launch { online.lessons.copyWhenAsked() }
        online.lessons.copyReady(RecordRead(PLAN, fractionsReady, askedAt = 0))
        eventually { database.lessonCopyDao().copied(ADA_KEY).isNotEmpty() && database.keptViewDao().kept(LESSON_VIEW) != null }
        copier.cancelAndJoin()
        server.web.shutdown()

        val offline = connection()
        val card = offline.lessons.openOrCopy(topic(1))

        assertEquals(LESSON_VIEW, card.resourceUri)
        assertEquals("ready", card.toolResult.getValue("structuredContent").jsonObject.string("status"))
        assertEquals(LESSON_HTML, offline.view(card.resourceUri).html)
        assertEquals(listOf("lesson_progress"), server.toolsCalled)
    }

    @Test
    fun `a view shown once opens with no connection after the app starts again`() = runBlocking {
        val online = connection()
        online.keepShown(LESSON_VIEW, online.view(LESSON_VIEW))
        server.web.shutdown()

        assertEquals(LESSON_HTML, connection().view(LESSON_VIEW).html)
    }

    @Test
    fun `a view read but never loaded keeps no page`() {
        runBlocking { connection().view(LESSON_VIEW) }
        server.web.shutdown()

        assertThrows(IOException::class.java) { runBlocking { connection().view(LESSON_VIEW) } }
    }

    @Test
    fun `a kept call answered with an empty reply is dropped, and the next goes`() = runBlocking {
        assertKeptCallAnsweredWithDropped("")
    }

    @Test
    fun `a kept call answered with a reply that is not JSON is dropped, and the next goes`() = runBlocking {
        assertKeptCallAnsweredWithDropped("<html>Bad gateway</html>")
    }

    private suspend fun assertKeptCallAnsweredWithDropped(reply: String) {
        var online = false
        val flaky = OkHttpClient.Builder().addInterceptor { chain ->
            if (!online) throw IOException("no connection")
            chain.proceed(chain.request())
        }.build()
        val connection = LearnerConnection(database, ADA_KEY, flaky, endpoint) { true }
        connection.call("give_lesson", JsonObject(emptyMap()))
        connection.call("lesson_progress", JsonObject(emptyMap()))

        online = true
        server.toolReplies = mapOf("give_lesson" to reply)

        assertEquals(2, connection.sendKept())
        assertEquals(listOf("give_lesson", "lesson_progress"), server.toolsCalled)
        assertEquals(emptyList<KeptCallEntity>(), database.keptCallDao().kept(ADA_KEY))
    }

    @Test
    fun `a server answering with nothing is an answer, never stood in for by the copy`() {
        val connection = connection()
        runBlocking { connection.lessons.openOrCopy(topic(1)) }

        server.answersWithNothing = true
        assertThrows(McpRefusal::class.java) { runBlocking { connection.lessons.openOrCopy(topic(1)) } }
    }

    @Test
    fun `a view's call whose session is refused after the learner was wiped keeps nothing, and fails`() {
        val refusing = OkHttpClient.Builder().addInterceptor {
            // As when the learner was removed elsewhere: the exchange wipes them, then the call is refused.
            database.clearAllTables()
            throw SessionRefusal("That learner is no longer learning on this device")
        }.build()
        val connection = LearnerConnection(database, ADA_KEY, refusing, endpoint) { false }

        assertThrows(SessionRefusal::class.java) { runBlocking { connection.call("answer_check", JsonObject(emptyMap())) } }
        assertEquals(emptyList<KeptCallEntity>(), runBlocking { database.keptCallDao().kept(ADA_KEY) })
    }

    @Test
    fun `a wipe waits for a lesson copy whose learner was already checked, and takes it too`() {
        val checked = CountDownLatch(1)
        val release = CountDownLatch(1)
        val connection = LearnerConnection(database, ADA_KEY, calls, endpoint) {
            checked.countDown()
            release.await(WAIT_SECONDS, TimeUnit.SECONDS)
            true
        }

        val opening = thread { runBlocking { connection.lessons.openOrCopy(topic(1)) } }
        assertTrue(checked.await(WAIT_SECONDS, TimeUnit.SECONDS))
        val wiping = thread { database.clearAllTables() }
        // Long enough for the wipe to finish, were nothing holding it back.
        Thread.sleep(WIPE_MS)
        release.countDown()
        opening.join(WAIT_SECONDS * 1_000)
        wiping.join(WAIT_SECONDS * 1_000)

        assertEquals(emptyList<CopiedLesson>(), runBlocking { database.lessonCopyDao().copied(ADA_KEY) })
    }

    private fun connection() = LearnerConnection(database, ADA_KEY, calls, endpoint) { true }

    private companion object {
        const val ADA_KEY = "uid-1/aaaaaaaaaaaa"
        const val WAIT_SECONDS = 5L
        const val WIPE_MS = 300L
    }
}

package com.latentic.graspy.mcp

import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.lesson.CopiedTopic
import com.latentic.graspy.lesson.PLAN
import com.latentic.graspy.lesson.eventually
import com.latentic.graspy.lesson.topic
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.RecordRead
import com.latentic.graspy.plan.TopicMark
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
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
 * away: what was copied while it answered opens, view and lesson, on a phone that never showed either.
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
    }

    @Test
    fun `a view shown once opens with no connection after the app starts again`() = runBlocking {
        assertEquals(LESSON_HTML, connection().view(LESSON_VIEW).html)
        server.web.shutdown()

        assertEquals(LESSON_HTML, connection().view(LESSON_VIEW).html)
    }

    @Test
    fun `a server answering with nothing is an answer, never stood in for by the copy`() {
        val connection = connection()
        runBlocking { connection.lessons.openOrCopy(topic(1)) }

        server.answersWithNothing = true
        assertThrows(McpRefusal::class.java) { runBlocking { connection.lessons.openOrCopy(topic(1)) } }
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

        assertEquals(emptyList<CopiedTopic>(), runBlocking { database.lessonCopyDao().copied(ADA_KEY) })
    }

    private fun connection() = LearnerConnection(database, ADA_KEY, calls, endpoint) { true }

    private companion object {
        const val ADA_KEY = "uid-1/aaaaaaaaaaaa"
        const val WAIT_SECONDS = 5L
        const val WIPE_MS = 300L
    }
}

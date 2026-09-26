package com.latentic.graspy.lesson

import com.latentic.graspy.account.SessionRefusal
import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.mcp.McpRefusal
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.LessonTarget
import com.latentic.graspy.plan.RecordRead
import com.latentic.graspy.plan.TopicMark
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A lesson once whole opens from the phone's copy while the server cannot be reached, as on the web. */
@RunWith(RobolectricTestRunner::class)
class OfflineLessonsTest {
    private val fractions = topic(1)
    private val decimals = topic(2)
    private val copies = FakeLessonCopies()
    private val server = FakeLessonServer()
    private var learning = true
    private var now = 1L
    private val lessons = OfflineLessons(copies, "uid/ada", server, { learning }) { now }

    @Test
    fun `offline, a lesson opens from the copy kept when it last opened whole`() = runBlocking {
        server.gives = lessonCard("ready")
        val whole = lessons.openOrCopy(fractions)

        server.reachable = false
        assertEquals(whole, lessons.openOrCopy(fractions))
    }

    @Test
    fun `a lesson that never arrived whole has no copy`() {
        server.gives = lessonCard("ready", whole = false)
        runBlocking { lessons.openOrCopy(fractions) }

        server.reachable = false
        assertThrows(IOException::class.java) { runBlocking { lessons.openOrCopy(fractions) } }
    }

    @Test
    fun `a refusal is the server's answer, never stood in for`() {
        server.gives = lessonCard("ready")
        runBlocking { lessons.openOrCopy(fractions) }

        server.refuses = true
        assertThrows(McpRefusal::class.java) { runBlocking { lessons.openOrCopy(fractions) } }
        assertThrows(McpRefusal::class.java) { runBlocking { lessons.toolOrCopy(fractions, lessonCard("ready"), "lesson_progress", JsonObject(emptyMap())) } }
    }

    @Test
    fun `another learner's copy is not theirs to open`() {
        server.gives = lessonCard("ready")
        runBlocking { lessons.openOrCopy(fractions) }

        server.reachable = false
        val bayo = OfflineLessons(copies, "uid/bayo", server, { true }) { 1L }
        assertThrows(IOException::class.java) { runBlocking { bayo.openOrCopy(fractions) } }
    }

    @Test
    fun `a lesson made while its view watches is kept once whole, and answers the view offline`() = runBlocking {
        server.gives = lessonCard("making")
        val making = lessons.openOrCopy(fractions)
        server.answers = lessonResult("ready")
        lessons.toolOrCopy(fractions, making, "lesson_progress", JsonObject(emptyMap()))

        server.reachable = false
        assertEquals(lessonResult("ready"), lessons.toolOrCopy(fractions, making, "lesson_progress", JsonObject(emptyMap())))
        assertEquals(making.copy(toolResult = lessonResult("ready")), lessons.openOrCopy(fractions))
    }

    @Test
    fun `a session refused is an answer, never stood in for`() {
        server.gives = lessonCard("ready")
        runBlocking { lessons.openOrCopy(fractions) }

        server.sessionRefused = true
        assertThrows(SessionRefusal::class.java) { runBlocking { lessons.openOrCopy(fractions) } }
        assertThrows(SessionRefusal::class.java) { runBlocking { lessons.toolOrCopy(fractions, lessonCard("ready"), "lesson_progress", JsonObject(emptyMap())) } }
    }

    @Test
    fun `a lesson the view watches is not kept while it is not whole`() {
        server.gives = lessonCard("making")
        val making = runBlocking { lessons.openOrCopy(fractions) }
        server.answers = lessonResult("ready", whole = false)
        runBlocking { lessons.toolOrCopy(fractions, making, "lesson_progress", JsonObject(emptyMap())) }

        server.reachable = false
        assertThrows(IOException::class.java) { runBlocking { lessons.toolOrCopy(fractions, making, "lesson_progress", JsonObject(emptyMap())) } }
    }

    @Test
    fun `a copy that cannot be saved never fails the lesson the server gave`() = runBlocking {
        copies.full = true
        server.gives = lessonCard("ready")
        server.answers = lessonResult("ready")

        assertEquals(lessonCard("ready").toolResult, lessons.openOrCopy(fractions).toolResult)
        assertEquals(lessonResult("ready"), lessons.toolOrCopy(fractions, lessonCard("making"), "lesson_progress", JsonObject(emptyMap())))
    }

    @Test
    fun `no copy is written once the device no longer learns as them`() = runBlocking {
        server.gives = lessonCard("ready")
        learning = false

        lessons.openOrCopy(fractions)

        assertEquals(emptyList<CopiedTopic>(), copies.copied("uid/ada"))
    }

    @Test
    fun `the copies follow the record, every ready lesson in the plan and no other, with their views`() = runBlocking {
        server.gives = lessonCard("ready")
        server.answers = lessonResult("ready")
        lessons.openOrCopy(fractions.copy(planId = "plan-0"))
        server.opened.clear()
        now = 2

        copying(until = { server.viewsKept == 1 && copies.copied("uid/ada") == listOf(fractions.copied) }) {
            lessons.copyReady(ready(1 to "Fractions", 1 to "Renamed"))
        }

        assertEquals(listOf(fractions.copied), copies.copied("uid/ada"))
        assertEquals(listOf("Fractions"), server.opened.map { it.topic })
        assertEquals(1, server.viewsKept)
    }

    @Test
    fun `the copy run asks only for lessons already kept, never starting one, and keeps what comes back whole`() = runBlocking {
        server.answers = lessonResult("ready")

        copying(until = { copies.copied("uid/ada") == listOf(fractions.copied) }) { lessons.copyReady(ready(1 to "Fractions")) }

        assertEquals(listOf("lesson_progress"), server.called)
        server.reachable = false
        val copy = lessons.openOrCopy(fractions)
        assertEquals("give_lesson", copy.toolName)
        assertEquals(lessonCard("ready").resourceUri, copy.resourceUri)
        assertEquals(fractions, apiJson.decodeFromJsonElement(LessonTarget.serializer(), copy.toolInput.getValue("target")))
        assertEquals(lessonResult("ready"), copy.toolResult)
    }

    @Test
    fun `a run with the same record asks nothing of lessons already copied`() = runBlocking {
        server.answers = lessonResult("ready")
        copying(until = { copies.copied("uid/ada") == listOf(fractions.copied) }) { lessons.copyReady(ready(1 to "Fractions")) }
        server.called.clear()

        copying(until = { server.viewsKept == 2 }) { lessons.copyReady(ready(1 to "Fractions")) }

        assertEquals(emptyList<String>(), server.called)
    }

    @Test
    fun `a topic whose lesson the server no longer has is not asked for again`() = runBlocking {
        server.answers = lessonResult("failed", whole = false)
        copying(until = { server.called.size == 1 }) { lessons.copyReady(ready(1 to "Fractions")) }
        server.called.clear()

        copying(until = { server.viewsKept == 2 }) { lessons.copyReady(ready(1 to "Fractions")) }

        assertEquals(emptyList<String>(), server.called)
    }

    @Test
    fun `a lesson still being made is asked for again on the next run`() = runBlocking {
        server.answers = lessonResult("making")
        copying(until = { server.called.size == 1 }) { lessons.copyReady(ready(1 to "Fractions")) }

        copying(until = { server.viewsKept == 2 }) { lessons.copyReady(ready(1 to "Fractions")) }

        assertEquals(listOf("lesson_progress", "lesson_progress"), server.called)
    }

    @Test
    fun `a topic the server no longer had is asked for again once the learner opens it`() = runBlocking {
        server.answers = lessonResult("failed", whole = false)
        copying(until = { server.called.size == 1 }) { lessons.copyReady(ready(1 to "Fractions")) }
        server.gives = lessonCard("making")
        lessons.openOrCopy(fractions)
        server.called.clear()

        copying(until = { server.viewsKept == 2 }) { lessons.copyReady(ready(1 to "Fractions")) }

        assertEquals(listOf("lesson_progress"), server.called)
    }

    @Test
    fun `a topic the record marks with no lesson made is never asked for`() = runBlocking {
        server.answers = lessonResult("ready")
        val learntWithoutALesson = RecordRead(PLAN, LearnerRecord(topics = listOf(TopicMark("mathematics", 1, "Fractions", learntAt = 5))), askedAt = now)

        copying(until = { server.viewsKept == 1 }) { lessons.copyReady(learntWithoutALesson) }

        assertEquals(emptyList<String>(), server.called)
        assertEquals(emptyList<CopiedTopic>(), copies.copied("uid/ada"))
    }

    @Test
    fun `the copy run keeps no lesson that is not whole`() = runBlocking {
        server.answers = lessonResult("ready", whole = false)

        copying(until = { server.opened.size == 1 }) { lessons.copyReady(ready(1 to "Fractions")) }

        assertEquals(emptyList<CopiedTopic>(), copies.copied("uid/ada"))
    }

    @Test
    fun `a record read before a lesson was kept never drops it, even told again with no connection`() = runBlocking {
        now = 100
        val beforeFractionsWasMade = ready(2 to "Decimals")
        now = 200
        server.gives = lessonCard("ready")
        lessons.openOrCopy(fractions)
        server.reachable = false

        copying(until = { server.opened.size == 1 }) { lessons.copyReady(beforeFractionsWasMade) }

        assertEquals(lessonCard("ready").toolResult, lessons.openOrCopy(fractions).toolResult)
    }

    @Test
    fun `a record read after a lesson was kept, without it, drops it`() = runBlocking {
        server.gives = lessonCard("ready")
        server.answers = lessonResult("ready")
        lessons.openOrCopy(fractions)
        now = 300

        copying(until = { copies.copied("uid/ada") == listOf(decimals.copied) }) { lessons.copyReady(ready(2 to "Decimals")) }

        assertEquals(listOf(decimals.copied), copies.copied("uid/ada"))
    }

    @Test
    fun `one lesson failing stops none after it`() = runBlocking {
        server.answers = lessonResult("ready")
        server.failsFor += "Fractions"

        copying(until = { server.opened.size == 2 }) { lessons.copyReady(ready(1 to "Fractions", 2 to "Decimals")) }

        assertEquals(listOf(decimals.copied), copies.copied("uid/ada"))
    }

    @Test
    fun `every record the server gives runs, one run at a time, and one arriving mid-run is not lost`() = runBlocking {
        server.answers = lessonResult("ready")
        val release = CompletableDeferred<Unit>()
        server.holdUntil = release

        copying(until = { server.viewsKept == 3 }) {
            lessons.copyReady(ready(1 to "Fractions"))
            eventually { server.mostAtOnce == 1 }
            lessons.copyReady(ready(1 to "Fractions", 2 to "Decimals"))
            delay(SETTLE_MS)
            release.complete(Unit)
            eventually { copies.copied("uid/ada").size == 2 }
            lessons.copyReady(ready(1 to "Fractions", 2 to "Decimals"))
        }

        assertEquals(1, server.mostAtOnce)
        assertEquals(setOf(fractions.copied, decimals.copied), copies.copied("uid/ada").toSet())
    }

    /** The record as the server gives it now, with a lesson made for each of [topics]. */
    private fun ready(vararg topics: Pair<Int, String>) = RecordRead(
        PLAN,
        LearnerRecord(topics = topics.map { (index, name) -> TopicMark("mathematics", index, name, lessonId = "lesson-$index-$name") }),
        askedAt = now,
    )

    /** Runs [asks] with the copier going, waits (within a timeout) [until] it has done what they asked, then stops it. */
    private suspend fun CoroutineScope.copying(until: suspend () -> Boolean, asks: suspend () -> Unit) {
        val copier = launch { lessons.copyWhenAsked() }
        asks()
        eventually(until)
        delay(SETTLE_MS)
        copier.cancelAndJoin()
    }

    private companion object {
        const val SETTLE_MS = 50L
    }
}

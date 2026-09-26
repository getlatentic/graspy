package com.latentic.graspy.lesson

import com.latentic.graspy.mcp.McpRefusal
import com.latentic.graspy.plan.LearnerRecord
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
    private val lessons = OfflineLessons(copies, "uid/ada", server, { learning }) { 1L }

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
        lessons.openOrCopy(fractions.copy(planId = "plan-0"))
        server.opened.clear()

        copying(until = { server.viewsKept == 1 && copies.copied("uid/ada") == listOf(fractions.copied) }) {
            lessons.copyReady(PLAN, ready(1 to "Fractions", 1 to "Renamed"))
        }

        assertEquals(listOf(fractions.copied), copies.copied("uid/ada"))
        assertEquals(listOf("Fractions"), server.opened.map { it.topic })
        assertEquals(1, server.viewsKept)
    }

    @Test
    fun `one lesson failing stops none after it`() = runBlocking {
        server.gives = lessonCard("ready")
        server.failsFor += "Fractions"

        copying(until = { server.opened.size == 2 }) { lessons.copyReady(PLAN, ready(1 to "Fractions", 2 to "Decimals")) }

        assertEquals(listOf(decimals.copied), copies.copied("uid/ada"))
    }

    @Test
    fun `every record the server gives runs, one run at a time, and one arriving mid-run is not lost`() = runBlocking {
        server.gives = lessonCard("ready")
        val release = CompletableDeferred<Unit>()
        server.holdUntil = release

        copying(until = { server.viewsKept == 3 }) {
            lessons.copyReady(PLAN, ready(1 to "Fractions"))
            eventually { server.mostAtOnce == 1 }
            lessons.copyReady(PLAN, ready(1 to "Fractions", 2 to "Decimals"))
            delay(SETTLE_MS)
            release.complete(Unit)
            eventually { copies.copied("uid/ada").size == 2 }
            lessons.copyReady(PLAN, ready(1 to "Fractions", 2 to "Decimals"))
        }

        assertEquals(1, server.mostAtOnce)
        assertEquals(setOf(fractions.copied, decimals.copied), copies.copied("uid/ada").toSet())
    }

    private fun ready(vararg topics: Pair<Int, String>) =
        LearnerRecord(topics = topics.map { (index, name) -> TopicMark("mathematics", index, name, lessonId = "lesson-$index-$name") })

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

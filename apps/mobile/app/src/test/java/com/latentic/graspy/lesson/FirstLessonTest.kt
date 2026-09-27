package com.latentic.graspy.lesson

import com.latentic.graspy.mcp.McpRefusal
import com.latentic.graspy.plan.Assessment
import com.latentic.graspy.plan.LearningSession
import com.latentic.graspy.plan.PlanSubject
import java.io.IOException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A new plan's first lesson is made before the plan is shown, as the web's prepareFirstLesson makes it. */
@RunWith(RobolectricTestRunner::class)
class FirstLessonTest {
    private val copies = FakeLessonCopies()
    private val server = FakeLessonServer()
    private val lessons = OfflineLessons(copies, "uid/ada", server, { true }) { 1L }
    private val waits = mutableListOf<String>()

    /** Each wait moves the lesson on to the next of [states], as lesson_progress then answers it. */
    private fun firstLesson(vararg states: String): FirstLesson {
        val next = states.iterator()
        return FirstLesson(lessons) { server.answers = lessonResult(next.next().also(waits::add)) }
    }

    @Test
    fun `a lesson ready at once starts the plan at its first topic, copied to the phone`() = runBlocking {
        server.gives = lessonCard("ready")

        val plan = firstLesson().prepared(PLAN)

        assertEquals(LearningSession("Mathematics", "Number Systems", 0, "explanation"), plan.activeSession)
        assertEquals(PLAN.copy(activeSession = plan.activeSession), plan)
        assertEquals(listOf(topic(0)), server.opened)
        assertEquals(listOf(topic(0).copied), copies.topics("uid/ada"))
        assertEquals(emptyList<String>(), waits)
    }

    @Test
    fun `a lesson being made is followed until it is ready`() = runBlocking {
        server.gives = lessonCard("making")

        val plan = firstLesson("making", "ready").prepared(PLAN)

        assertEquals(listOf("making", "ready"), waits)
        assertEquals(listOf("give_lesson", "lesson_progress", "lesson_progress"), server.called)
        assertEquals(0, plan.activeSession?.topicIndex)
    }

    @Test
    fun `the subject the plan names next is the one prepared`() = runBlocking {
        val music = PlanSubject("Music", "music")
        val both = PLAN.copy(subjects = PLAN.subjects + music, topics = PLAN.topics + ("music" to listOf("Rhythm")), assessment = Assessment("music"))
        server.gives = lessonCard("ready")

        val plan = firstLesson().prepared(both)

        assertEquals(LearningSession("Music", "Rhythm", 0, "explanation"), plan.activeSession)
        assertEquals(listOf("Rhythm"), server.opened.map { it.topic })
    }

    @Test
    fun `a lesson whose making fails fails the plan`() {
        server.gives = lessonCard("making")

        assertThrows(LessonNotMade::class.java) { runBlocking { firstLesson("failed").prepared(PLAN) } }
    }

    @Test
    fun `a lesson ready with nothing in it fails the plan`() {
        val noLesson = buildJsonObject {
            put("content", JsonArray(emptyList()))
            putJsonObject("structuredContent") { put("status", "ready") }
        }
        server.gives = lessonCard("ready").copy(toolResult = noLesson)

        assertThrows(LessonNotMade::class.java) { runBlocking { firstLesson().prepared(PLAN) } }
    }

    @Test
    fun `offline, the plan is not made, since a new plan has no lesson on the phone`() {
        server.reachable = false

        assertThrows(IOException::class.java) { runBlocking { firstLesson().prepared(PLAN) } }
        assertEquals(emptyList<Any>(), runBlocking { copies.topics("uid/ada") })
    }

    @Test
    fun `a refused lesson fails the plan`() {
        server.refuses = true

        assertThrows(McpRefusal::class.java) { runBlocking { firstLesson().prepared(PLAN) } }
    }

    @Test
    fun `a plan with no topic has no lesson to prepare`() = runBlocking {
        val empty = PLAN.copy(topics = emptyMap())

        assertSame(empty, firstLesson().prepared(empty))
        assertEquals(emptyList<String>(), server.called)
    }
}

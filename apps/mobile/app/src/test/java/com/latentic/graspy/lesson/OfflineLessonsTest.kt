package com.latentic.graspy.lesson

import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.mcp.McpRefusal
import com.latentic.graspy.mcp.ViewCard
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.LessonTarget
import com.latentic.graspy.plan.PlanSubject
import com.latentic.graspy.plan.TopicMark
import com.latentic.graspy.plan.TopicMarks
import com.latentic.graspy.plan.lessonTarget
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/** A lesson once whole opens from the phone's copy while the server cannot be reached, as on the web. */
class OfflineLessonsTest {
    private val maths = PlanSubject("Mathematics", "mathematics")
    private val plan = LearnerPlan(
        planId = "plan-1",
        country = "Nigeria",
        language = "English",
        gradeLevel = "JSS 1",
        subjects = listOf(maths),
        topics = mapOf("mathematics" to listOf("Number Systems", "Fractions")),
    )
    private val fractions = requireNotNull(lessonTarget(plan, maths, 1, TopicMarks(LearnerRecord())))
    private val copies = FakeCopies()
    private val server = FakeServer()
    private val lessons = OfflineLessons(copies, "uid/ada", server) { 1L }

    @Test
    fun `offline, a lesson opens from the copy kept when it last opened whole`() = runBlocking {
        server.gives = card("ready")
        val whole = lessons.openOrCopy(fractions)

        server.reachable = false
        assertEquals(whole, lessons.openOrCopy(fractions))
    }

    @Test
    fun `a lesson that never arrived whole has no copy`() {
        server.gives = card("ready", whole = false)
        runBlocking { lessons.openOrCopy(fractions) }

        server.reachable = false
        assertThrows(IOException::class.java) { runBlocking { lessons.openOrCopy(fractions) } }
    }

    @Test
    fun `a refusal is the server's answer, never stood in for`() {
        server.gives = card("ready")
        runBlocking { lessons.openOrCopy(fractions) }

        server.refuses = true
        assertThrows(McpRefusal::class.java) { runBlocking { lessons.openOrCopy(fractions) } }
        assertThrows(McpRefusal::class.java) { runBlocking { lessons.toolOrCopy(fractions, card("ready"), "lesson_progress", JsonObject(emptyMap())) } }
    }

    @Test
    fun `another learner's copy is not theirs to open`() {
        server.gives = card("ready")
        runBlocking { lessons.openOrCopy(fractions) }

        server.reachable = false
        val bayo = OfflineLessons(copies, "uid/bayo", server) { 1L }
        assertThrows(IOException::class.java) { runBlocking { bayo.openOrCopy(fractions) } }
    }

    @Test
    fun `a lesson made while its view watches is kept once whole, and answers the view offline`() = runBlocking {
        server.gives = card("making")
        val making = lessons.openOrCopy(fractions)
        server.answers = result("ready")
        lessons.toolOrCopy(fractions, making, "lesson_progress", JsonObject(emptyMap()))

        server.reachable = false
        assertEquals(result("ready"), lessons.toolOrCopy(fractions, making, "lesson_progress", JsonObject(emptyMap())))
        assertEquals(making.copy(toolResult = result("ready")), lessons.openOrCopy(fractions))
    }

    @Test
    fun `the copies follow the record, every ready lesson in the plan and no other`() = runBlocking {
        server.gives = card("ready")
        lessons.openOrCopy(fractions.copy(planId = "plan-0"))
        val record = LearnerRecord(
            topics = listOf(
                TopicMark("mathematics", 0, "Number Systems", learntAt = 5),
                TopicMark("mathematics", 1, "Fractions", lessonId = "lesson-9"),
                TopicMark("mathematics", 1, "Renamed", lessonId = "lesson-3"),
            ),
        )
        server.opened.clear()

        lessons.copyReady(plan, record)
        lessons.copyReady(plan, record)

        assertEquals(setOf(fractions.copied), copies.copied("uid/ada").toSet())
        assertEquals(listOf("Fractions"), server.opened.map { it.topic })
    }

    @Test
    fun `one copying run at a time`() = runBlocking {
        server.gives = card("ready")
        val record = LearnerRecord(topics = listOf(TopicMark("mathematics", 1, "Fractions", lessonId = "lesson-9")))
        val release = CompletableDeferred<Unit>()
        server.holdUntil = release

        val first = async { lessons.copyReady(plan, record) }
        yield()
        lessons.copyReady(plan, record)
        release.complete(Unit)
        first.await()

        assertEquals(1, server.opened.size)
    }

    private fun result(status: String, whole: Boolean = status == "ready") = buildJsonObject {
        put("content", JsonArray(emptyList()))
        putJsonObject("structuredContent") {
            put("status", status)
            put("whole", whole)
            putJsonObject("lesson") { put("title", "Fractions") }
        }
    }

    private fun card(status: String, whole: Boolean = status == "ready") =
        ViewCard("ui://graspy/lesson", "give_lesson", JsonObject(emptyMap()), result(status, whole))

    private class FakeServer : LessonServer {
        var reachable = true
        var refuses = false
        var gives: ViewCard? = null
        var answers: JsonObject = JsonObject(emptyMap())
        var holdUntil: CompletableDeferred<Unit>? = null
        val opened = mutableListOf<LessonTarget>()

        override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard {
            answerable()
            holdUntil?.await()
            opened += apiJson.decodeFromJsonElement(LessonTarget.serializer(), arguments.getValue("target").jsonObject)
            return requireNotNull(gives).copy(toolInput = arguments)
        }

        override suspend fun callTool(name: String, arguments: JsonObject): JsonObject {
            answerable()
            return answers
        }

        private fun answerable() {
            if (refuses) throw McpRefusal("refused")
            if (!reachable) throw IOException("no connection")
        }
    }

    private class FakeCopies : LessonCopyDao {
        private val rows = mutableMapOf<Pair<String, CopiedTopic>, LessonCopyEntity>()

        override suspend fun keep(copy: LessonCopyEntity) {
            rows[copy.ownerId to CopiedTopic(copy.planId, copy.subjectSlug, copy.topicIndex, copy.topic)] = copy
        }

        override suspend fun card(ownerId: String, planId: String, subjectSlug: String, topicIndex: Int, topic: String) =
            rows[ownerId to CopiedTopic(planId, subjectSlug, topicIndex, topic)]?.cardJson

        override suspend fun copied(ownerId: String) = rows.keys.filter { it.first == ownerId }.map { it.second }

        override suspend fun drop(ownerId: String, planId: String, subjectSlug: String, topicIndex: Int, topic: String) {
            rows.remove(ownerId to CopiedTopic(planId, subjectSlug, topicIndex, topic))
        }
    }
}

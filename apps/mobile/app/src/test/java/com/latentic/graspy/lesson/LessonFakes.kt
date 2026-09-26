package com.latentic.graspy.lesson

import android.database.sqlite.SQLiteFullException
import com.latentic.graspy.account.SessionRefusal
import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.mcp.McpRefusal
import com.latentic.graspy.mcp.ViewCard
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.LessonTarget
import com.latentic.graspy.plan.PlanSubject
import com.latentic.graspy.plan.TopicMarks
import com.latentic.graspy.plan.lessonTarget
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

val MATHS = PlanSubject("Mathematics", "mathematics")

val PLAN = LearnerPlan(
    planId = "plan-1",
    country = "Nigeria",
    language = "English",
    gradeLevel = "JSS 1",
    subjects = listOf(MATHS),
    topics = mapOf("mathematics" to listOf("Number Systems", "Fractions", "Decimals")),
)

fun topic(index: Int): LessonTarget = requireNotNull(lessonTarget(PLAN, MATHS, index, TopicMarks(LearnerRecord())))

fun lessonResult(status: String, whole: Boolean = status == "ready") = buildJsonObject {
    put("content", JsonArray(emptyList()))
    putJsonObject("structuredContent") {
        put("status", status)
        put("whole", whole)
        putJsonObject("lesson") { put("title", "Fractions") }
    }
}

fun lessonCard(status: String, whole: Boolean = status == "ready") =
    ViewCard("ui://graspy/lesson", "give_lesson", JsonObject(emptyMap()), lessonResult(status, whole))

/** Fails the test instead of hanging it when what it waits for never comes. */
suspend fun eventually(condition: suspend () -> Boolean) = withTimeout(5_000) {
    while (!condition()) delay(5)
}

class FakeLessonServer : LessonServer {
    var reachable = true
    var refuses = false
    var sessionRefused = false
    var gives: ViewCard? = null
    var answers: JsonObject = JsonObject(emptyMap())
    var holdUntil: CompletableDeferred<Unit>? = null
    val failsFor = mutableSetOf<String>()
    val opened = mutableListOf<LessonTarget>()
    var viewsKept = 0
    private var inFlight = 0
    var mostAtOnce = 0

    override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard {
        answerable()
        val target = apiJson.decodeFromJsonElement(LessonTarget.serializer(), arguments.getValue("target").jsonObject)
        inFlight += 1
        mostAtOnce = maxOf(mostAtOnce, inFlight)
        try {
            holdUntil?.await()
        } finally {
            inFlight -= 1
        }
        opened += target
        if (target.topic in failsFor) throw McpRefusal("${target.topic} was refused")
        return requireNotNull(gives).copy(toolInput = arguments)
    }

    override suspend fun callTool(name: String, arguments: JsonObject): JsonObject {
        answerable()
        return answers
    }

    override suspend fun keepViews() {
        answerable()
        viewsKept += 1
    }

    private fun answerable() {
        if (refuses) throw McpRefusal("refused")
        if (sessionRefused) throw SessionRefusal("graspy did not issue a session")
        if (!reachable) throw IOException("no connection")
    }
}

class FakeLessonCopies : LessonCopyDao {
    private val rows = mutableMapOf<Pair<String, CopiedTopic>, LessonCopyEntity>()
    var full = false

    override suspend fun keep(copy: LessonCopyEntity) {
        if (full) throw SQLiteFullException("database or disk is full")
        rows[copy.ownerId to CopiedTopic(copy.planId, copy.subjectSlug, copy.topicIndex, copy.topic)] = copy
    }

    override suspend fun card(ownerId: String, planId: String, subjectSlug: String, topicIndex: Int, topic: String) =
        rows[ownerId to CopiedTopic(planId, subjectSlug, topicIndex, topic)]?.cardJson

    override suspend fun copied(ownerId: String) = rows.keys.filter { it.first == ownerId }.map { it.second }

    override suspend fun drop(ownerId: String, planId: String, subjectSlug: String, topicIndex: Int, topic: String, savedBefore: Long) {
        val key = ownerId to CopiedTopic(planId, subjectSlug, topicIndex, topic)
        if ((rows[key]?.savedAt ?: return) < savedBefore) rows.remove(key)
    }
}

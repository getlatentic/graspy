package com.latentic.graspy.lesson

import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.mcp.ViewCard
import com.latentic.graspy.mcp.isUnreachable
import com.latentic.graspy.mcp.string
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.LessonTarget
import com.latentic.graspy.plan.TopicMarks
import com.latentic.graspy.plan.lessonTarget
import kotlinx.coroutines.sync.Mutex
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

private const val GIVE_LESSON = "give_lesson"
private const val LESSON_PROGRESS = "lesson_progress"

fun isLessonTool(name: String): Boolean = name == GIVE_LESSON || name == LESSON_PROGRESS

/** The server as a lesson reaches it: the lesson's view opened, and the view's own calls. */
interface LessonServer {
    suspend fun openToolView(name: String, arguments: JsonObject): ViewCard

    suspend fun callTool(name: String, arguments: JsonObject): JsonObject
}

/**
 * Whole lessons are copied to the phone and stand in for the server while it cannot be reached, as the
 * web's do (features/learn/lib/lesson-offline.ts). A server that answers, even with a refusal, is never
 * stood in for. Copies are the learner's own, under [ownerId].
 */
class OfflineLessons(
    private val copies: LessonCopyDao,
    private val ownerId: String,
    private val server: LessonServer,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val copying = Mutex()

    /** [attempt] goes up only when the learner retries after a failure. */
    suspend fun openOrCopy(target: LessonTarget, attempt: Int = 0): ViewCard = try {
        server.openToolView(GIVE_LESSON, lessonArguments(target, attempt)).also { keepIfWhole(target, it) }
    } catch (failure: Exception) {
        (if (failure.isUnreachable()) copyOf(target) else null) ?: throw failure
    }

    /** A lesson tool the view calls; while the server is unreachable, the copy answers it. */
    suspend fun toolOrCopy(target: LessonTarget, card: ViewCard, name: String, arguments: JsonObject): JsonObject = try {
        server.callTool(name, arguments).also { keepIfWhole(target, card.copy(toolResult = it)) }
    } catch (failure: Exception) {
        (if (failure.isUnreachable()) copyOf(target)?.toolResult else null) ?: throw failure
    }

    /**
     * Keeps exactly the plan's ready lessons, including ones made on another device: copies no longer ready
     * go, missing ones are opened and kept. One run at a time: a call while one runs leaves it to that run.
     */
    suspend fun copyReady(plan: LearnerPlan, record: LearnerRecord) {
        if (!copying.tryLock()) return
        try {
            copyAll(plan, record)
        } finally {
            copying.unlock()
        }
    }

    private suspend fun copyAll(plan: LearnerPlan, record: LearnerRecord) {
        val wanted = record.topics.filter { it.lessonId != null }.map { CopiedTopic(plan.planId, it.subjectSlug, it.topicIndex, it.topic) }
        val copied = copies.copied(ownerId)
        copies.dropAll(ownerId, copied - wanted.toSet())
        val marks = TopicMarks(record)
        for (topic in wanted - copied.toSet()) {
            val subject = plan.subject(topic.subjectSlug) ?: continue
            val target = lessonTarget(plan, subject, topic.topicIndex, marks)?.takeIf { it.topic == topic.topic } ?: continue
            keepIfWhole(target, server.openToolView(GIVE_LESSON, lessonArguments(target, 0)))
        }
    }

    private suspend fun keepIfWhole(target: LessonTarget, card: ViewCard) {
        if (!card.toolResult.isWhole()) return
        copies.keep(
            LessonCopyEntity(
                ownerId = ownerId,
                planId = target.planId,
                subjectSlug = target.subjectSlug,
                topicIndex = target.topicIndex,
                topic = target.topic,
                cardJson = apiJson.encodeToString(ViewCard.serializer(), card),
                savedAt = clock(),
            ),
        )
    }

    private suspend fun copyOf(target: LessonTarget): ViewCard? = with(target.copied) {
        copies.card(ownerId, planId, subjectSlug, topicIndex, topic)?.let { apiJson.decodeFromString(ViewCard.serializer(), it) }
    }
}

private fun JsonObject.isWhole(): Boolean {
    val state = this["structuredContent"] as? JsonObject ?: return false
    return state.string("status") == "ready" && (state["whole"] as? JsonPrimitive)?.booleanOrNull == true
}

private fun lessonArguments(target: LessonTarget, attempt: Int): JsonObject = buildJsonObject {
    put("target", apiJson.encodeToJsonElement(target))
    put("attempt", attempt)
}

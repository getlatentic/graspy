package com.latentic.graspy.lesson

import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.mcp.ViewCard
import com.latentic.graspy.mcp.bestEffort
import com.latentic.graspy.mcp.isUnreachable
import com.latentic.graspy.mcp.string
import com.latentic.graspy.plan.LessonTarget
import com.latentic.graspy.plan.RecordRead
import com.latentic.graspy.plan.TopicMarks
import com.latentic.graspy.plan.lessonTarget
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

private const val GIVE_LESSON = "give_lesson"
private const val LESSON_PROGRESS = "lesson_progress"
private const val TAG = "GraspyLessons"

fun isLessonTool(name: String): Boolean = name == GIVE_LESSON || name == LESSON_PROGRESS

/** The server as a lesson reaches it: the lesson's view opened, the view's own calls, and its views kept. */
interface LessonServer {
    suspend fun openToolView(name: String, arguments: JsonObject): ViewCard

    suspend fun callTool(name: String, arguments: JsonObject): JsonObject

    /** Keeps the documents lessons open in, so a lesson copied here opens with no connection. */
    suspend fun keepViews()
}

/**
 * Whole lessons are copied to the phone and stand in for the server while it cannot be reached, as the
 * web's do (features/learn/lib/lesson-offline.ts). A server that answers, even with a refusal, is never
 * stood in for, and keeping a copy never fails the lesson. Copies are the learner's own, under [ownerId],
 * and none is written once the device no longer learns as them ([stillLearning]).
 */
class OfflineLessons(
    private val copies: LessonCopyDao,
    private val ownerId: String,
    private val server: LessonServer,
    private val stillLearning: () -> Boolean,
    /** Runs the learner check and the write as one: a wipe waits for a write already checked, then takes it too. */
    private val inOneTransaction: suspend (suspend () -> Unit) -> Unit = { it() },
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val asked = Channel<RecordRead>(Channel.CONFLATED)

    /** [attempt] goes up only when the learner retries after a failure. */
    suspend fun openOrCopy(target: LessonTarget, attempt: Int = 0): ViewCard {
        val card = try {
            server.openToolView(GIVE_LESSON, lessonArguments(target, attempt))
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            return standIn(target, failure)
        }
        if (card.toolResult.isWhole()) keep(target, card)
        return card
    }

    /** A lesson tool the view calls; while the server is unreachable, the copy answers it. */
    suspend fun toolOrCopy(target: LessonTarget, card: ViewCard, name: String, arguments: JsonObject): JsonObject {
        val result = try {
            server.callTool(name, arguments)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            return standIn(target, failure).toolResult
        }
        if (result.isWhole()) keep(target, card.copy(toolResult = result))
        return result
    }

    /**
     * Asks for exactly the plan's ready lessons to be on the phone, including ones made on another device.
     * Every record the server gives asks; one arriving while a run goes is run next, the latest only.
     */
    fun copyReady(read: RecordRead) {
        asked.trySend(read)
    }

    /** Runs what [copyReady] asks for, one run at a time, for as long as the calling scope lives. */
    suspend fun copyWhenAsked() {
        for (read in asked) copyAll(read)
    }

    /**
     * Copies no longer ready go and missing ones are opened and kept, each on its own: one failing stops none.
     * A copy kept since the record was asked for stays, since the record cannot know of it.
     */
    private suspend fun copyAll(read: RecordRead) {
        val (plan, record) = read
        bestEffort(TAG, "Keeping the lesson views") { server.keepViews() }
        val wanted = record.topics.filter { it.lessonId != null }.map { CopiedTopic(plan.planId, it.subjectSlug, it.topicIndex, it.topic) }
        val copied = bestEffort(TAG, "Reading the lesson copies") { copies.copied(ownerId) } ?: return
        bestEffort(TAG, "Dropping lessons no longer ready") { copies.dropAll(ownerId, copied - wanted.toSet(), read.askedAt) }
        val marks = TopicMarks(record)
        for (topic in wanted - copied.toSet()) {
            val subject = plan.subject(topic.subjectSlug) ?: continue
            val target = lessonTarget(plan, subject, topic.topicIndex, marks)?.takeIf { it.topic == topic.topic } ?: continue
            val card = bestEffort(TAG, "Copying the lesson on ${target.topic}") { server.openToolView(GIVE_LESSON, lessonArguments(target, 0)) }
            if (card != null && card.toolResult.isWhole()) keep(target, card)
        }
    }

    /** The copy stands in only for a server that could not be reached; otherwise the failure stands. */
    private suspend fun standIn(target: LessonTarget, failure: Exception): ViewCard =
        (if (failure.isUnreachable()) copyOf(target) else null) ?: throw failure

    private suspend fun keep(target: LessonTarget, card: ViewCard) {
        val copy = LessonCopyEntity(
            ownerId = ownerId,
            planId = target.planId,
            subjectSlug = target.subjectSlug,
            topicIndex = target.topicIndex,
            topic = target.topic,
            cardJson = apiJson.encodeToString(ViewCard.serializer(), card),
            savedAt = clock(),
        )
        bestEffort(TAG, "Keeping a copy of the lesson on ${target.topic}") {
            inOneTransaction { if (stillLearning()) copies.keep(copy) }
        }
    }

    private suspend fun copyOf(target: LessonTarget): ViewCard? = bestEffort(TAG, "Reading the copy of the lesson on ${target.topic}") {
        with(target.copied) { copies.card(ownerId, planId, subjectSlug, topicIndex, topic) }
            ?.let { apiJson.decodeFromString(ViewCard.serializer(), it) }
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

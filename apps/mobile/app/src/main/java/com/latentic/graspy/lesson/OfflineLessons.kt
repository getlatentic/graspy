package com.latentic.graspy.lesson

import android.util.Log
import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.mcp.ViewCard
import com.latentic.graspy.mcp.bestEffort
import com.latentic.graspy.mcp.isUnreachable
import com.latentic.graspy.mcp.string
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.LessonTarget
import com.latentic.graspy.plan.RecordRead
import com.latentic.graspy.plan.TopicMarks
import com.latentic.graspy.plan.lessonTarget
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

private const val GIVE_LESSON = "give_lesson"
private const val LESSON_PROGRESS = "lesson_progress"
private const val TAG = "GraspyLessons"
private const val READY = "ready"
// lesson_progress's answer when no lesson is kept for the topic and none is being made, or its making failed
// (apps/server lessons/tools.py). It never starts one, so asking again answers the same.
private const val FAILED = "failed"

fun isLessonTool(name: String): Boolean = name == GIVE_LESSON || name == LESSON_PROGRESS

/** The server as a lesson reaches it: the lesson's view opened, the view's own calls, and its views kept. */
interface LessonServer {
    suspend fun openToolView(name: String, arguments: JsonObject): ViewCard

    suspend fun callTool(name: String, arguments: JsonObject): JsonObject

    /** The view [name]'s result is shown in. */
    suspend fun viewOf(name: String): String

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

    /**
     * Lessons the server no longer has though the record names them (lessons are kept for a time), with nothing
     * making them: it answers the same until the learner opens the topic or the record names a new lesson, so
     * they are not asked for again.
     */
    private val gone = ConcurrentHashMap.newKeySet<CopiedLesson>()

    /** [attempt] goes up only when the learner retries after a failure. */
    suspend fun openOrCopy(target: LessonTarget, attempt: Int = 0): ViewCard {
        val card = try {
            server.openToolView(GIVE_LESSON, lessonArguments(target, attempt))
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            return standIn(target, failure)
        }
        gone.removeAll { it.topic == target.copied }
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
        for (read in asked) bestEffort(TAG, "Copying the ready lessons") { copyAll(read) }
    }

    /**
     * Copies no longer ready go, and missing ones or ones holding another lesson than the record names are
     * opened and kept. A copy kept since the record was asked for stays, since the record cannot know of it.
     */
    private suspend fun copyAll(read: RecordRead) {
        val (plan, record) = read
        bestEffort(TAG, "Keeping the lesson views") { server.keepViews() }
        val wanted = record.topics.mapNotNull { mark ->
            mark.lessonId?.let { CopiedLesson(CopiedTopic(plan.planId, mark.subjectSlug, mark.topicIndex, mark.topic), it) }
        }
        val copied = bestEffort(TAG, "Reading the lesson copies") { copies.copied(ownerId) } ?: return
        val stale = copied.map { it.topic } - wanted.map { it.topic }.toSet()
        bestEffort(TAG, "Dropping lessons no longer ready") { copies.dropAll(ownerId, stale, read.askedAt) }
        val marks = TopicMarks(record)
        for (lesson in wanted - copied.toSet() - gone) copyOne(plan, marks, lesson)
    }

    /** A lesson that fails is skipped; a server that cannot be reached ends the run, as on the web. */
    private suspend fun copyOne(plan: LearnerPlan, marks: TopicMarks, lesson: CopiedLesson) {
        val topic = lesson.topic
        val subject = plan.subject(topic.subjectSlug) ?: return
        val target = lessonTarget(plan, subject, topic.topicIndex, marks)?.takeIf { it.topic == topic.topic } ?: return
        val card = try {
            keptLesson(target)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            if (failure.isUnreachable()) throw failure
            Log.w(TAG, "Copying the lesson on ${target.topic} failed", failure)
            return
        }
        when {
            card.toolResult.isWhole() -> keep(target, card, lesson.lessonId)
            card.toolResult.status() == FAILED -> gone += lesson
        }
    }

    /**
     * The lesson the server keeps for [target], as its view would open it. Asked with lesson_progress, which
     * never starts one: give_lesson would pay to make a lesson nobody opened, for a record that may be stale.
     */
    private suspend fun keptLesson(target: LessonTarget): ViewCard {
        val arguments = lessonArguments(target, 0)
        return ViewCard(server.viewOf(GIVE_LESSON), GIVE_LESSON, arguments, server.callTool(LESSON_PROGRESS, arguments))
    }

    /** The copy stands in only for a server that could not be reached; otherwise the failure stands. */
    private suspend fun standIn(target: LessonTarget, failure: Exception): ViewCard =
        (if (failure.isUnreachable()) copyOf(target) else null) ?: throw failure

    /** [onRecord] names the lesson for a server that leaves its id out of the result. */
    private suspend fun keep(target: LessonTarget, card: ViewCard, onRecord: String? = null) {
        val cardJson = withContext(Dispatchers.Default) { apiJson.encodeToString(ViewCard.serializer(), card) }
        val copy = LessonCopyEntity(
            ownerId = ownerId,
            planId = target.planId,
            subjectSlug = target.subjectSlug,
            topicIndex = target.topicIndex,
            topic = target.topic,
            cardJson = cardJson,
            savedAt = clock(),
            lessonId = card.toolResult.state()?.string("lessonId") ?: onRecord,
        )
        bestEffort(TAG, "Keeping a copy of the lesson on ${target.topic}") {
            inOneTransaction { if (stillLearning()) copies.keep(copy) }
        }
    }

    private suspend fun copyOf(target: LessonTarget): ViewCard? = bestEffort(TAG, "Reading the copy of the lesson on ${target.topic}") {
        with(target.copied) { copies.card(ownerId, planId, subjectSlug, topicIndex, topic) }
            ?.let { withContext(Dispatchers.Default) { apiJson.decodeFromString(ViewCard.serializer(), it) } }
    }
}

private fun JsonObject.state(): JsonObject? = this["structuredContent"] as? JsonObject

private fun JsonObject.status(): String? = state()?.string("status")

private fun JsonObject.isWhole(): Boolean =
    status() == READY && (state()?.get("whole") as? JsonPrimitive)?.booleanOrNull == true

private fun lessonArguments(target: LessonTarget, attempt: Int): JsonObject = buildJsonObject {
    put("target", apiJson.encodeToJsonElement(target))
    put("attempt", attempt)
}

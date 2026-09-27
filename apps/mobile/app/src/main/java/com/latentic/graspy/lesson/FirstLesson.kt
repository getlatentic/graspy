package com.latentic.graspy.lesson

import com.latentic.graspy.mcp.string
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.LearningSession
import com.latentic.graspy.plan.LessonTarget
import com.latentic.graspy.plan.TopicMarks
import com.latentic.graspy.plan.lessonTarget
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

private const val LESSON_PROGRESS = "lesson_progress"
private const val MAKING = "making"
private const val READY = "ready"
private const val EXPLANATION = "explanation"
// How often the web's lessonMade asks after a lesson being made (features/learn/lib/lesson-app.ts).
private const val WATCH_MS = 2_500L

/** The lesson was not made; a plan waiting on it is not kept. */
class LessonNotMade(topic: String) : Exception("The lesson on $topic could not be made")

/**
 * A new plan's first lesson, made before the plan is shown so the first tap opens a ready lesson, as the web's
 * prepareFirstLesson (features/learn/lib/first-lesson.ts). A lesson that fails, or a server out of reach, fails
 * the plan. The lesson is copied to the phone once it arrives whole, as any lesson opened.
 */
class FirstLesson(private val lessons: OfflineLessons, private val pause: suspend () -> Unit = { delay(WATCH_MS) }) {
    /** [plan], set to start at its first lesson once that lesson is ready; a plan with no topic is left as it is. */
    suspend fun prepared(plan: LearnerPlan): LearnerPlan {
        val target = firstTarget(plan) ?: return plan
        made(target)
        return plan.copy(activeSession = LearningSession(target.subject, target.topic, target.topicIndex, EXPLANATION))
    }

    /** Opens the lesson as its view would, then follows its making until it is ready or fails. */
    private suspend fun made(target: LessonTarget) {
        val card = lessons.openOrCopy(target)
        var result = card.toolResult
        while (result.status() == MAKING) {
            pause()
            result = lessons.toolOrCopy(target, card, LESSON_PROGRESS, card.toolInput)
        }
        if (!result.isReady()) throw LessonNotMade(target.topic)
    }
}

/** The subject the plan names next, else its first, at its first topic. */
private fun firstTarget(plan: LearnerPlan): LessonTarget? {
    val subject = plan.assessment?.nextSubject?.let(plan::subject) ?: plan.subjects.firstOrNull() ?: return null
    return lessonTarget(plan, subject, 0, TopicMarks(LearnerRecord()))
}

private fun JsonObject.lessonState(): JsonObject? = this["structuredContent"] as? JsonObject

private fun JsonObject.status(): String? = lessonState()?.string("status")

/** Ready with a lesson in it, as the web's lessonMade requires. */
private fun JsonObject.isReady(): Boolean = status() == READY && lessonState()?.get("lesson").let { it != null && it != JsonNull }

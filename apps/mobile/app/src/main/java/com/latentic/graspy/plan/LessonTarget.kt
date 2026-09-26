package com.latentic.graspy.plan

import kotlinx.serialization.Serializable

/** A topic's lesson as the server's give_lesson asks for it (lessons/making.LessonTarget). */
@Serializable
data class LessonTarget(
    val planId: String,
    val subjectSlug: String,
    val subject: String,
    val topicIndex: Int,
    val topic: String,
    val totalTopics: Int,
    val country: String,
    val language: String,
    val gradeLevel: String,
    /** A path goal's unlearnt earlier steps, which its lesson recaps. */
    val buildsOn: List<String>? = null,
)

fun lessonTarget(plan: LearnerPlan, subject: PlanSubject, topicIndex: Int, marks: TopicMarks): LessonTarget? {
    val topics = plan.topicsOf(subject.slug)
    val topic = topics.getOrNull(topicIndex) ?: return null
    val buildsOn = if (topicIndex == plan.goalIndex(subject.slug)) {
        topics.take(topicIndex).filterIndexed { index, earlier -> marks.standing(subject.slug, index, earlier) != Standing.LEARNT }
    } else {
        emptyList()
    }
    return LessonTarget(
        planId = plan.planId,
        subjectSlug = subject.slug,
        subject = subject.name,
        topicIndex = topicIndex,
        topic = topic,
        totalTopics = topics.size,
        country = plan.country,
        language = plan.language,
        gradeLevel = plan.topicLevel(subject.slug, topic),
        buildsOn = buildsOn.ifEmpty { null },
    )
}

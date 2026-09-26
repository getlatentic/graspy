package com.latentic.graspy.plan

/** Where a topic stands for the learner: learnt, its lesson made and waiting, or not started. */
enum class Standing { LEARNT, READY, NOT_STARTED }

/** The learner's marks on one plan, read as the web reads them (features/learn/lib/topic-marks.ts). */
class TopicMarks(record: LearnerRecord) {
    private val learnt = record.topics.filter { it.learntAt != null }.map(::keyOf).toSet()
    private val ready = record.topics.filter { it.lessonId != null }.map(::keyOf).toSet()

    fun standing(subjectSlug: String, index: Int, topic: String): Standing = when (Triple(subjectSlug, index, topic)) {
        in learnt -> Standing.LEARNT
        in ready -> Standing.READY
        else -> Standing.NOT_STARTED
    }

    fun learntIn(subjectSlug: String, topics: List<String>): Int =
        topics.withIndex().count { (index, topic) -> Triple(subjectSlug, index, topic) in learnt }

    /** -1 when all are learnt. An unlearnt path goal comes first: it is what the learner asked for. */
    fun nextToLearn(subjectSlug: String, topics: List<String>, goal: Int = -1): Int {
        val open = { index: Int -> Triple(subjectSlug, index, topics[index]) !in learnt }
        if (goal in topics.indices && open(goal)) return goal
        return topics.indices.firstOrNull(open) ?: -1
    }

    private fun keyOf(mark: TopicMark) = Triple(mark.subjectSlug, mark.topicIndex, mark.topic)
}

data class SubjectRow(val subject: PlanSubject, val nextTopic: String?, val completed: Int, val total: Int)

fun subjectRows(plan: LearnerPlan, marks: TopicMarks): List<SubjectRow> = plan.subjects.map { subject ->
    val topics = plan.topicsOf(subject.slug)
    val next = marks.nextToLearn(subject.slug, topics, plan.goalIndex(subject.slug))
    SubjectRow(subject, topics.getOrNull(next), marks.learntIn(subject.slug, topics), topics.size)
}

/** The topic Home continues. */
data class CurrentTopic(val subject: PlanSubject, val index: Int, val topic: String, val started: Boolean)

/**
 * As the web's (features/learn/lib/current-topic.ts), so the two cannot disagree: the subject the plan
 * names next, else the one last studied, else the first; the topic last studied there, else a path's
 * goal, else the first.
 */
fun currentTopic(plan: LearnerPlan): CurrentTopic? {
    val subject = plan.subjects.firstOrNull { it.slug == plan.assessment?.nextSubject }
        ?: plan.subjects.firstOrNull { it.name == plan.activeSession?.subject }
        ?: plan.subjects.firstOrNull()
        ?: return null
    val topics = plan.topicsOf(subject.slug)
    val session = plan.activeSession?.takeIf { it.subject == subject.name && it.topicIndex in topics.indices }
    val index = session?.topicIndex ?: maxOf(0, plan.goalIndex(subject.slug))
    return topics.getOrNull(index)?.let { CurrentTopic(subject, index, it, started = session != null && session.phase != "complete") }
}

data class PracticeTally(val answered: Int, val right: Int)

/** Practice answers only; those asked outside a subject count toward the total alone. */
fun practiceTally(answers: List<RecordedAnswer>): Pair<PracticeTally, Map<String, PracticeTally>> {
    val practice = answers.filter { it.source == "practice" }
    val tallyOf = { some: List<RecordedAnswer> -> PracticeTally(some.size, some.count(RecordedAnswer::correct)) }
    val bySubject = practice.filter { it.subjectSlug != null }.groupBy { it.subjectSlug!! }.mapValues { tallyOf(it.value) }
    return tallyOf(practice) to bySubject
}

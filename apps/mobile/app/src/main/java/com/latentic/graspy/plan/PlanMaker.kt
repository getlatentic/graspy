package com.latentic.graspy.plan

import kotlinx.serialization.json.JsonObject

/** Where plans come from: the curriculum stream, or a fake of it. */
fun interface CurriculumSource {
    /** Each result as it arrives; the stream's own error message, if it sent one. */
    suspend fun curriculum(request: CurriculumRequest, onResult: (JsonObject) -> Unit): String?
}

/** The stream sent its own error; the plan was not made. */
class PlanNotMade(message: String) : Exception(message)

private const val DEFAULT_GRADE_LEVEL = "middle school"

/** Plans made from the curriculum stream, as the web's onboarding and rebuild make them. */
class PlanMaker(private val source: CurriculumSource, private val clock: () -> Long = System::currentTimeMillis) {
    /**
     * A new plan for [details] with [subjects], replacing whatever the learner had; [onProgress] shows it as
     * it grows. An empty subject list asks the server to choose the subjects.
     */
    suspend fun make(details: LearnerDetails, subjects: List<String>, onProgress: (LearnerPlan) -> Unit = {}): LearnerPlan {
        val createdAt = clock()
        val accumulator = CurriculumAccumulator(normalizeSubjectNames(subjects))
        val planNow = {
            LearnerPlan(planId = "plan-$createdAt", createdAt = createdAt, updatedAt = clock())
                .withDetails(details)
                .let { plan -> plan.copy(gradeLevel = plan.gradeLevel.ifBlank { DEFAULT_GRADE_LEVEL }) }
                .copy(
                    subjects = accumulator.subjects,
                    topics = accumulator.topics,
                    assessment = Assessment(accumulator.firstSubject?.slug),
                )
        }
        val failure = source.curriculum(details.request(subjects)) { result ->
            if (accumulator.apply(result)) onProgress(planNow())
        }
        if (failure != null) throw PlanNotMade(failure)
        return planNow()
    }

    /** Topics for subjects new to a plan; subjects it keeps keep theirs, and their progress. */
    suspend fun topicsFor(details: LearnerDetails, kept: List<PlanSubject>, added: List<String>): Pair<List<PlanSubject>, Map<String, List<String>>> {
        val accumulator = CurriculumAccumulator(normalizeSubjectList(kept + added.map { PlanSubject(it, "") }).drop(kept.size))
        val failure = source.curriculum(details.request(added)) { accumulator.apply(it) }
        if (failure != null) throw PlanNotMade(failure)
        return accumulator.subjects to accumulator.topics
    }
}

/** A rebuild asks again for the subjects the learner chose; paths stay as the learner accepted them. */
fun LearnerPlan.rebuildSubjects(): List<String> = (subjects - paths().toSet()).map { it.name }

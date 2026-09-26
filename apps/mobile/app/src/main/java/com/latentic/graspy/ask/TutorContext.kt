package com.latentic.graspy.ask

import com.latentic.graspy.plan.LearnerPlan
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The learner's situation, sent as message metadata so the message stays the learner's own words: as the
 * web's (features/learn/lib/tutor-context.ts), names rather than codes, because the model reads them, and the
 * conversation's subject and topic rather than the screen's.
 */
fun tutorContext(plan: LearnerPlan, scope: ThreadScope): JsonObject = buildJsonObject {
    plan.countryShown.ifBlank { null }?.let { put("country", it) }
    plan.languageShown.ifBlank { null }?.let { put("language", it) }
    plan.gradeLevel.ifBlank { null }?.let { put("gradeLevel", it) }
    plan.planId.ifBlank { null }?.let { put("planId", it) }
    if (plan.subjects.isNotEmpty()) {
        put(
            "subjects",
            buildJsonArray {
                plan.subjects.forEach { subject ->
                    add(buildJsonObject {
                        put("name", subject.name)
                        put("slug", subject.slug)
                    })
                }
            },
        )
    }
    val slug = when (scope) {
        is ThreadScope.Topic -> scope.subjectSlug
        is ThreadScope.Subject -> scope.subjectSlug
        is ThreadScope.General -> return@buildJsonObject
    }
    val subject = plan.subject(slug) ?: return@buildJsonObject
    put("subject", subject.name)
    put("subjectSlug", subject.slug)
    if (scope is ThreadScope.Topic) put("topic", scope.topic)
    plan.topicsOf(subject.slug).takeIf { it.isNotEmpty() }?.let { topics -> put("topics", buildJsonArray { topics.forEach { add(JsonPrimitive(it)) } }) }
}

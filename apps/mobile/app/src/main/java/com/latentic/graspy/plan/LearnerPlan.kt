package com.latentic.graspy.plan

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

/** English, and local names keyed by language tag. */
@Serializable
data class Names(val en: String, val local: Map<String, String>? = null) {
    fun inLanguage(language: String): String = local?.get(language) ?: en
}

/**
 * The plan a learner's devices share, as the web writes it (apps/web/src/lib/curriculum-record.ts). The
 * server keeps every field it is sent, so fields this app does not read travel on in [extras].
 */
@Serializable
data class LearnerPlan(
    val planId: String,
    val id: String = "current",
    /** The English name the server and the model read. */
    val country: String = "",
    val countryName: String? = null,
    val countryCode: String? = null,
    val language: String = "",
    val languageName: String? = null,
    val languageCode: String? = null,
    /** The level as the server reads it, such as "JSS 1 (Junior Secondary School), Nigeria, age 12". */
    val gradeLevel: String = "",
    val system: String? = null,
    val level: String? = null,
    val levelNames: Names? = null,
    val course: String? = null,
    val subjects: List<PlanSubject> = emptyList(),
    val topics: Map<String, List<String>> = emptyMap(),
    /** A path's topics each at their own level; everything else is at [gradeLevel]. */
    val levels: Map<String, Map<String, String>> = emptyMap(),
    /** The topic a path leads to, by subject. */
    val goals: Map<String, String> = emptyMap(),
    val activeSession: LearningSession? = null,
    val assessment: Assessment? = null,
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
    @Transient val extras: JsonObject = JsonObject(emptyMap()),
) {
    fun topicsOf(subjectSlug: String): List<String> = topics[subjectSlug].orEmpty()

    fun goalIndex(subjectSlug: String): Int = goals[subjectSlug]?.let(topicsOf(subjectSlug)::indexOf) ?: -1

    fun topicLevel(subjectSlug: String, topic: String): String = levels[subjectSlug]?.get(topic) ?: gradeLevel

    fun subject(slug: String): PlanSubject? = subjects.firstOrNull { it.slug == slug }

    /** Names rather than codes, because the model reads them. */
    val countryShown: String get() = countryName?.ifBlank { null } ?: country

    val languageShown: String get() = languageName?.ifBlank { null } ?: language

    /** Whose subjects are made by a path to a goal, so a rebuild leaves them as the learner accepted them. */
    fun paths(): List<PlanSubject> = subjects.filter { levels.containsKey(it.slug) }

    fun toJson(): JsonObject = JsonObject(extras + planJson.encodeToJsonElement(this).jsonObject)

    companion object {
        private val KNOWN = serializer().descriptor.let { descriptor -> (0 until descriptor.elementsCount).map(descriptor::getElementName).toSet() }

        fun of(json: JsonObject): LearnerPlan =
            planJson.decodeFromJsonElement<LearnerPlan>(json).copy(extras = JsonObject(json.filterKeys { it !in KNOWN }))
    }
}

@Serializable
data class PlanSubject(val name: String, val slug: String)

/** Where the learner last was, by subject name. */
@Serializable
data class LearningSession(val subject: String, val topic: String? = null, val topicIndex: Int? = null, val phase: String? = null)

@Serializable
data class Assessment(val nextSubject: String? = null)

internal val planJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

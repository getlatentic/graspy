package com.latentic.graspy.plan

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * A plan's subjects and topics as the curriculum stream sends them, as the web folds them
 * (features/learn/lib/curriculum-accumulator.ts): the stream names subjects as strings or objects,
 * repeats them, and keys topics by slug or display name. Kept by slug, found by name, updated on repeats.
 */
class CurriculumAccumulator(initial: List<PlanSubject> = emptyList()) {
    private val bySlug = LinkedHashMap<String, PlanSubject>().apply { initial.forEach { put(it.slug, it) } }
    private val topicsBySlug = LinkedHashMap<String, List<String>>()

    val subjects: List<PlanSubject> get() = bySlug.values.toList()

    val topics: Map<String, List<String>> get() = LinkedHashMap(topicsBySlug)

    val firstSubject: PlanSubject? get() = bySlug.values.firstOrNull()

    /** True when anything changed. */
    fun apply(result: JsonObject): Boolean {
        val subjectsChanged = (result["subjects"] as? JsonArray)?.map(::addSubject)?.any { it } ?: false
        val topicsChanged = (result["topics"] as? JsonObject)?.let(::addTopics) ?: false
        return subjectsChanged || topicsChanged
    }

    private fun addSubject(entry: kotlinx.serialization.json.JsonElement): Boolean = when (entry) {
        is JsonPrimitive -> entry.contentOrNull?.let(::addName) ?: false
        is JsonObject -> (entry["name"] as? JsonPrimitive)?.contentOrNull?.let { name ->
            addEntry(name, (entry["slug"] as? JsonPrimitive)?.contentOrNull)
        } ?: false
        else -> false
    }

    private fun findByName(name: String): PlanSubject? = bySlug.values.firstOrNull { it.name == name }

    private fun addName(raw: String): Boolean {
        val name = raw.trim()
        if (name.isEmpty() || findByName(name) != null) return false
        val slug = createSlug(name, bySlug.keys.toMutableSet())
        if (slug in bySlug) return false
        bySlug[slug] = PlanSubject(name, slug)
        return true
    }

    // The slug field may hold a display name; the name lookup prevents a duplicate.
    private fun addEntry(rawName: String, rawSlug: String?): Boolean {
        val name = rawName.trim()
        val slug = normalizeSlug(rawSlug?.trim()?.ifEmpty { null } ?: name)
        val existing = bySlug[slug] ?: findByName(name)
        return when {
            existing == null -> {
                bySlug[slug] = PlanSubject(name, slug)
                true
            }
            existing.name == name -> false
            else -> {
                bySlug[existing.slug] = existing.copy(name = name)
                true
            }
        }
    }

    private fun addTopics(topics: JsonObject): Boolean {
        var changed = false
        topics.forEach { (key, value) ->
            val list = (value as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()
            if (list.isEmpty()) return@forEach
            val subject = bySlug[normalizeSlug(key)] ?: findByName(key)
            topicsBySlug[subject?.slug ?: normalizeSlug(key)] = list
            changed = true
        }
        return changed
    }
}

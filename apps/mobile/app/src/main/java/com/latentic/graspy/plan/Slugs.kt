package com.latentic.graspy.plan

import java.text.Normalizer
import java.util.Locale

// Letters with no Unicode decomposition, such as Hausa's hooked consonants. Must match the web's
// lib/slug.ts and the server's app/utils/slug.py, or one subject lands twice in a plan.
private val TRANSLITERATIONS = mapOf(
    'ɓ' to "b", 'ɗ' to "d", 'ƙ' to "k", 'ƴ' to "y", 'ø' to "o", 'æ' to "ae", 'œ' to "oe",
    'å' to "a", 'ß' to "ss", 'ð' to "d", 'þ' to "th", 'ł' to "l", 'đ' to "d",
)
private val MARKS = Regex("\\p{M}")
private val NOT_LETTERS = Regex("[^\\p{L}\\p{N}]+")

// Letters and digits of every script stay: keeping only a-z would slug every Arabic subject "subject".
private fun fold(value: String): String {
    val unmarked = Normalizer.normalize(Normalizer.normalize(value, Normalizer.Form.NFKD).lowercase(Locale.ROOT), Normalizer.Form.NFKD)
        .replace(MARKS, "")
    return unmarked.map { TRANSLITERATIONS[it] ?: it.toString() }.joinToString("")
        .replace(NOT_LETTERS, "-")
        .trim('-')
}

fun normalizeSlug(value: String): String = fold(value).ifEmpty { "subject" }

/** A slug not yet in [existing], which it joins. */
fun createSlug(source: String, existing: MutableSet<String>): String {
    val base = normalizeSlug(source)
    var slug = base
    var suffix = 2
    while (slug in existing) slug = "$base-${suffix++}"
    existing += slug
    return slug
}

/** Names trimmed, blanks dropped, each with a slug no other has; a subject's own slug is kept when free. */
fun normalizeSubjectList(subjects: List<PlanSubject>): List<PlanSubject> {
    val existing = mutableSetOf<String>()
    return subjects.mapNotNull { entry ->
        val name = entry.name.trim().ifEmpty { return@mapNotNull null }
        val given = entry.slug.trim()
        val slug = if (given.isNotEmpty() && given !in existing) given.also(existing::add) else createSlug(name, existing)
        PlanSubject(name, slug)
    }
}

fun normalizeSubjectNames(names: List<String>): List<PlanSubject> = normalizeSubjectList(names.map { PlanSubject(it, "") })

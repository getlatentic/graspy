package com.latentic.graspy.plan

import kotlinx.serialization.json.JsonObject

// A plan's edits, as the web makes them (features/learn/lib/curriculum-edit.ts). Each returns a new plan
// stamped [now]; topics stay keyed by slug only, so an edit never leaves two lists for one subject.

private fun LearnerPlan.topicsFor(subjects: List<PlanSubject>): Map<String, List<String>> =
    subjects.associate { it.slug to topicsOf(it.slug) }

private fun <T> Map<String, T>.ofSubjects(subjects: List<PlanSubject>): Map<String, T> =
    subjects.map { it.slug }.toSet().let { slugs -> filterKeys { it in slugs } }

/** The topic's place, adding it when the subject lacks it; null when there is no such subject. */
fun LearnerPlan.withTopic(subjectSlug: String, title: String, now: Long): Pair<LearnerPlan, Int>? {
    val subject = subject(subjectSlug) ?: return null
    val wanted = title.trim().ifEmpty { return null }
    val topics = topicsOf(subject.slug)
    val existing = topics.indexOfFirst { it.equals(wanted, ignoreCase = true) }
    if (existing >= 0) return this to existing
    val next = copy(topics = topicsFor(subjects) + (subject.slug to topics + wanted), updatedAt = now)
    return next to topics.size
}

/** A path to a goal as a subject of its own, each step at its own level, ending at the goal. */
fun LearnerPlan.withPath(path: LearningPath, now: Long): Pair<LearnerPlan, PlanSubject> {
    val name = path.subject.trim().ifEmpty { path.goal.trim() }
    subjects.firstOrNull { it.name == name }?.let { return this to it }
    val subject = normalizeSubjectList(subjects + PlanSubject(name, "")).last()
    val steps = path.steps.filterIndexed { index, step ->
        step.title.isNotBlank() && path.steps.indexOfFirst { it.title == step.title } == index
    }
    val goal = steps.lastOrNull()?.title
    val next = copy(
        subjects = subjects + subject,
        topics = topicsFor(subjects) + (subject.slug to steps.map { it.title }),
        levels = levels + (subject.slug to steps.associate { it.title to it.level }),
        goals = goals + listOfNotNull(goal?.let { subject.slug to it }),
        updatedAt = now,
    )
    return next to subject
}

/** The paths [source] had that this plan lacks, carried over. */
fun LearnerPlan.withPathsFrom(source: LearnerPlan, now: Long): LearnerPlan {
    val carried = source.paths().filter { path -> subjects.none { it.name == path.name } }
    if (carried.isEmpty()) return this
    return copy(
        subjects = subjects + carried,
        topics = topicsFor(subjects) + source.topicsFor(carried),
        levels = levels + source.levels.ofSubjects(carried),
        goals = goals + source.goals.ofSubjects(carried),
        updatedAt = now,
    )
}

fun namesAfter(subjects: List<PlanSubject>, add: List<String>, remove: List<String>): List<String> =
    (subjects.map { it.name }.filterNot { it in remove } + add.map { it.trim() }).distinct().filter { it.isNotEmpty() }

data class SubjectChange(val kept: List<PlanSubject>, val removed: List<PlanSubject>, val added: List<String>)

fun subjectChange(current: List<PlanSubject>, names: List<String>): SubjectChange {
    val chosen = names.map { it.trim() }.filter { it.isNotEmpty() }.toCollection(LinkedHashSet())
    val currentNames = current.map { it.name }.toSet()
    return SubjectChange(
        kept = current.filter { it.name in chosen },
        removed = current.filterNot { it.name in chosen },
        added = chosen.filterNot { it in currentNames },
    )
}

/** Only new subjects bring topics; kept ones keep theirs and their progress. */
fun LearnerPlan.withSubjects(kept: List<PlanSubject>, added: List<PlanSubject>, addedTopics: Map<String, List<String>>, now: Long): LearnerPlan {
    val all = kept + added
    val session = activeSession?.takeIf { active -> kept.any { it.name == active.subject } }
    val next = assessment?.nextSubject?.takeIf { slug -> all.any { it.slug == slug } } ?: all.firstOrNull()?.slug
    return copy(
        subjects = all,
        topics = topicsFor(kept) + added.associate { it.slug to addedTopics[it.slug].orEmpty() },
        levels = levels.ofSubjects(kept),
        goals = goals.ofSubjects(kept),
        activeSession = session,
        assessment = Assessment(next),
        updatedAt = now,
        extras = extras.withSourcesOf(kept),
    )
}

/** The official curriculum of the kept subjects only: an added one here is planned by a model, which this app asks without the class. */
private fun JsonObject.withSourcesOf(kept: List<PlanSubject>): JsonObject {
    val sources = this["sources"] as? JsonObject ?: return this
    val slugs = kept.map { it.slug }.toSet()
    return JsonObject(this + ("sources" to JsonObject(sources.filterKeys { it in slugs })))
}

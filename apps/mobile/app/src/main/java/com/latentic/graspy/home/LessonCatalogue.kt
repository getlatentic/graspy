package com.latentic.graspy.home

import androidx.compose.ui.graphics.Color
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.HomeCopy
import com.latentic.graspy.practice.spokenLanguage
import com.latentic.graspy.ui.GraspyColor
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** How far a learner has come on one lesson, as the Worker's mastery rule counts it. */
enum class LessonStanding(val wireValue: String) {
    MASTERED("mastered"),
    LEARNT("learnt"),
    STARTED("started"),
    UNTOUCHED("untouched"),
    ;

    companion object {
        fun fromWire(value: String): LessonStanding =
            requireNotNull(entries.firstOrNull { it.wireValue == value }) { "unknown lesson standing $value" }
    }
}

@Serializable
data class CatalogueLessonDto(
    @SerialName("plan_id") val planId: String,
    val subject: String,
    val topic: String,
    val title: Map<String, String>,
    val standing: String,
    @SerialName("days_correct") val daysCorrect: Int = 0,
    val current: Boolean = false,
)

@Serializable
data class CatalogueDto(val day: String, val lessons: List<CatalogueLessonDto>)

/** One lesson of the learner's class as Home reads it: a title they can read, and a standing. */
data class CatalogueLesson(
    val planId: String,
    val subject: String,
    val topic: String,
    val title: String,
    val standing: LessonStanding,
    val current: Boolean,
    /** Days this lesson's check was answered correctly; two wins its badge. */
    val daysCorrect: Int = 0,
)

/** One theme of a subject — the times tables, counting, telling the time — and its lessons. */
data class TopicLessons(val subject: String, val topic: String, val lessons: List<CatalogueLesson>)

/** Every catalogue lesson carries every language, so a missing title is a broken plan, not a default. */
fun CatalogueLessonDto.toLesson(language: AppLanguage): CatalogueLesson = CatalogueLesson(
    planId = planId,
    subject = subject,
    topic = topic,
    title = requireNotNull(title[language.spokenLanguage()]) { "no title for $language in $planId" },
    standing = LessonStanding.fromWire(standing),
    current = current,
    daysCorrect = daysCorrect,
)

/** The one lesson the teacher would give next, or nothing when the class is finished for today. */
fun List<CatalogueLesson>.currentLesson(): CatalogueLesson? = firstOrNull { it.current }

/**
 * Lessons under the theme they belong to, in teaching order.
 *
 * Grouping by subject alone puts thirty-two lessons under one heading, twelve of which are times
 * tables that differ by a single word. The curriculum already names the theme in every plan id, so
 * a learner sees eight headings they can tell apart rather than one wall.
 */
fun List<CatalogueLesson>.byTopic(): List<TopicLessons> =
    groupBy { it.subject to it.topic }
        .map { (key, lessons) -> TopicLessons(key.first, key.second, lessons) }

data class StandingBadge(val label: String, val pill: Color, val text: Color)

/** Standing as a quiet state in the app's own meaning: green is correct, grey is not done. */
fun standingBadge(copy: HomeCopy, standing: LessonStanding): StandingBadge = when (standing) {
    LessonStanding.MASTERED -> StandingBadge(copy.mastered, GraspyColor.SuccessSoft, GraspyColor.Success)
    LessonStanding.LEARNT -> StandingBadge(copy.learnt, GraspyColor.WarningSoft, GraspyColor.Warning)
    LessonStanding.STARTED -> StandingBadge(copy.started, GraspyColor.Surface, GraspyColor.AccentInk)
    LessonStanding.UNTOUCHED -> StandingBadge(copy.untouched, GraspyColor.Canvas, GraspyColor.Muted)
}

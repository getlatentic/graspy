package com.latentic.graspy.practice

import com.latentic.graspy.localization.AppLanguage
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SequenceItemDto(val id: String, val spoken: String)

@Serializable
data class LessonActivity(
    val kind: String,
    @SerialName("prompt_id") val promptId: String,
    val items: List<SequenceItemDto> = emptyList(),
)

/** One Gagné event of a lesson plan as the teacher chose it, or a rest when nothing is due. */
@Serializable
data class LessonMove(
    val kind: String,
    @SerialName("plan_id") val planId: String = "",
    @SerialName("event_id") val eventId: String = "",
    val event: String = "",
    val subject: String = "",
    val title: Map<String, String> = emptyMap(),
    val say: String,
    @SerialName("say_text") val sayText: Map<String, String> = emptyMap(),
    val show: Map<String, String>? = null,
    val activity: LessonActivity? = null,
    val reason: String = "",
) {
    val exercise: PracticeExercise? get() = activity?.let { PracticeExercise.forActivity(it, subject) }

    val promptUtterances: List<TeacherUtterance> get() = listOf(TeacherUtterance(say))

    fun text(language: AppLanguage): String = sayText.inLanguage(language)

    fun titleText(language: AppLanguage): String = title.inLanguage(language)

    fun showText(language: AppLanguage): String? = show?.inLanguage(language)

    companion object {
        const val EVENT = "event"
        const val REST = "rest"
    }
}

/** Every plan says every event in every language, so a missing one is a broken plan, not a default. */
private fun Map<String, String>.inLanguage(language: AppLanguage): String =
    if (isEmpty()) "" else requireNotNull(this[language.spokenLanguage()]) { "no text for $language" }

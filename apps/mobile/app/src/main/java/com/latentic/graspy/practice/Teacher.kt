package com.latentic.graspy.practice

import androidx.annotation.DrawableRes
import com.latentic.graspy.R
import com.latentic.graspy.localization.SchoolClass

/**
 * A graspy teacher is our own persona, never the provider's voice name. The voice behind a persona
 * is a deployment detail chosen on the Worker (YarnGPT Idera today, Spitch as fallback).
 */
data class Teacher(
    val id: String,
    val name: String,
    val subject: String,
    @DrawableRes val portrait: Int,
) {
    val initial: String get() = name.substringAfterLast(' ').take(1).uppercase()

    companion object {
        val AUNTY_CHIOMA = Teacher(
            id = "aunty-chioma",
            name = "Aunty Chioma",
            subject = "Mathematics",
            portrait = R.drawable.teacher_aunty_chioma,
        )

        /** Teachers a learner can chat with. Uncle Bayo joins once a Yoruba-accented male voice is published. */
        val all: List<Teacher> = listOf(AUNTY_CHIOMA)

        /**
         * Primary classes have one class teacher for every subject; JSS has one teacher per subject.
         * Until more personas are published both resolve to Aunty Chioma.
         */
        fun forClass(schoolClass: SchoolClass): List<Teacher> = if (schoolClass.primary) listOf(AUNTY_CHIOMA) else all
    }
}

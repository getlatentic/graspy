package com.latentic.graspy.onboarding

import com.latentic.graspy.plan.LearnerDetails
import com.latentic.graspy.plan.Names
import com.latentic.graspy.plan.afterSchoolDescriptor
import com.latentic.graspy.plan.isAfterSchool

/** A class chosen from a school system: its names, and the level as the server reads it. */
data class SchoolChoice(val names: Names, val descriptor: String)

/** The details being chosen, as the web's form holds them (features/onboarding/lib/details.ts). */
data class DetailsForm(
    val country: String = "",
    val language: String = "",
    val system: String = "",
    val level: String = "",
    val school: SchoolChoice? = null,
    val course: String = "",
) {
    fun details(): LearnerDetails = if (isAfterSchool(level)) {
        val course = course.trim()
        LearnerDetails(country, language, "", level, null, course, afterSchoolDescriptor(level, course))
    } else {
        LearnerDetails(country, language, system, level, school?.names, "", school?.descriptor.orEmpty())
    }

    val complete: Boolean get() = details().complete

    /** Whether saving would change what the learner has. */
    fun changes(current: LearnerDetails): Boolean = details().let { next ->
        next.country != current.country || next.language != current.language || next.system != current.system ||
            next.level != current.level || next.course != current.course
    }

    companion object {
        fun of(details: LearnerDetails) = DetailsForm(
            country = details.country,
            language = details.language,
            system = details.system,
            level = if (details.levelNames != null || isAfterSchool(details.level)) details.level else "",
            school = details.levelNames?.let { SchoolChoice(it, details.gradeLevel) },
            course = details.course,
        )
    }
}

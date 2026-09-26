package com.latentic.graspy.plan

import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.localization.SchoolClass

/** Offered after a school system's own classes; the course then names what the learner studies. */
val AFTER_SCHOOL = listOf("undergraduate", "graduate")

/** Onboarding does not offer it; plans an earlier version made keep it. */
const val ON_MY_OWN = "on-my-own"

/** The server reads a level of at most 100 characters; the longest after-school prefix leaves this for the course. */
const val COURSE_MAX = 68
private const val LEVEL_MAX = 100

fun isAfterSchool(level: String?): Boolean = level in AFTER_SCHOOL

/**
 * Who the plan is for, as the web keeps it (apps/web/src/lib/user-storage.ts): country and language as codes,
 * the class as its school system, level and names, and [gradeLevel] as the server reads it.
 */
data class LearnerDetails(
    val country: String,
    val language: String,
    val system: String,
    val level: String,
    val levelNames: Names?,
    val course: String,
    val gradeLevel: String,
) {
    val complete: Boolean
        get() = country.isNotBlank() && language.isNotBlank() &&
            if (isAfterSchool(level)) course.isNotBlank() else system.isNotBlank() && level.isNotBlank() && levelNames != null

    /** The server and the model read English names; the codes bring the details back. */
    fun request(subjects: List<String>) = CurriculumRequest(countryName(country), languageName(language), gradeLevel, subjects)
}

/** "JSS 1 (Junior Secondary School), Nigeria, age 12", as the server reads a class. */
fun schoolDescriptor(system: SchoolSystem, level: SchoolLevel): String {
    val stage = system.stages.firstOrNull { it.id == level.stage }?.name?.en
    val where = "${system.name.en}, age ${level.age}"
    val full = if (stage != null) "${level.name.en} ($stage), $where" else "${level.name.en}, $where"
    return if (full.length <= LEVEL_MAX) full else "${level.name.en}, $where".take(LEVEL_MAX)
}

/** The course chooses the subjects: Accounting gets Auditing and Taxation. */
fun afterSchoolDescriptor(level: String, course: String): String {
    val who = if (level == "graduate") "Graduate student" else "Undergraduate student"
    return "$who, studying ${course.trim()}"
}

/** A plan's details written from the learner's: English names for the server, codes to bring them back. */
fun LearnerPlan.withDetails(details: LearnerDetails): LearnerPlan {
    val country = countryName(details.country)
    val language = languageName(details.language)
    return copy(
        country = country,
        countryName = country,
        countryCode = details.country,
        language = language,
        languageName = language,
        languageCode = details.language,
        gradeLevel = details.gradeLevel,
        system = details.system,
        level = details.level,
        levelNames = details.levelNames,
        course = details.course,
    )
}

/** The learner's details as the plan keeps them; a plan from before it kept its level names its class only by gradeLevel. */
fun LearnerPlan.details(): LearnerDetails = LearnerDetails(
    country = countryCode ?: countryCodeOf(country).orEmpty(),
    language = languageCodeOrGuess(),
    system = system.orEmpty(),
    level = level.orEmpty(),
    levelNames = levelNames,
    course = course.orEmpty(),
    gradeLevel = gradeLevel,
)

fun LearnerPlan.languageCodeOrGuess(): String = languageCode ?: languageCodeOf(language).orEmpty()

/**
 * The class as the learner reads it: its name in their language. A plan from before plans kept their class's
 * names has only the level the server reads, "Grade 8 (Basic school), Slovakia, age 13"; its class is the
 * name that leads it.
 */
fun LearnerPlan.levelLabel(learn: LearnCopy): String = when {
    level == "undergraduate" -> learn.level.undergraduate
    level == "graduate" -> learn.level.graduate
    level == ON_MY_OWN -> learn.you.onMyOwn
    levelNames != null -> levelNames.inLanguage(languageCodeOrGuess())
    else -> SCHOOL_CLASS.find(gradeLevel)?.groupValues?.get(1) ?: gradeLevel
}

// schoolDescriptor's shape: the class's name, its stage in brackets, then the system and the age.
private val SCHOOL_CLASS = Regex("^(.+?) \\(.*\\), .+, age \\d+$")

/**
 * The voice-lesson class of a learner in Nigeria's system, as the web's voiceClassOf; null when there are none.
 * The catalogue names a class "nursery-1" or "primary-4", the voice curriculum "nursery_1" or "primary_4".
 */
fun LearnerPlan.voiceClass(): SchoolClass? {
    if (system != "NG") return null
    return SchoolClass.fromWire(level.orEmpty().replace('-', '_'))?.takeIf { it.voiceLessons }
}

/** The teacher speaks the learner's language when she can, and English otherwise. */
fun LearnerPlan.voiceLanguage(): AppLanguageSelection = when (languageCodeOrGuess()) {
    "yo" -> AppLanguageSelection.YORUBA
    "pcm" -> AppLanguageSelection.PIDGIN
    else -> AppLanguageSelection.ENGLISH
}

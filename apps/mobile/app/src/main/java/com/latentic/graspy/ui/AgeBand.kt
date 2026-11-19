package com.latentic.graspy.ui

import com.latentic.graspy.plan.AFTER_SCHOOL

/** The learner's age band, which sets the look of cards and buttons; the web's `ageBand` holds the same rule. */
enum class AgeBand { Child, Tween, Teen }

/** Where the younger look gives way to the next. */
private const val TWEEN_FROM = 11
private const val TEEN_FROM = 15

private val AGE = Regex("""\bage (\d{1,2})\b""")

/**
 * The age in the class's descriptor ("JSS 1 (Junior Secondary School), Nigeria, age 12"), or teen after school.
 * A known class that names no age is a child, as on the web; a class not known yet has no band at all.
 */
fun ageBandOf(level: String?, gradeLevel: String): AgeBand {
    if (level in AFTER_SCHOOL) return AgeBand.Teen
    val age = AGE.find(gradeLevel)?.groupValues?.get(1)?.toInt() ?: return AgeBand.Child
    return when {
        age >= TEEN_FROM -> AgeBand.Teen
        age >= TWEEN_FROM -> AgeBand.Tween
        else -> AgeBand.Child
    }
}

/** The tween look while the class is not known yet. */
fun radiiFor(band: AgeBand?): GraspyRadii = when (band) {
    AgeBand.Child -> ChildRadii
    AgeBand.Teen -> TeenRadii
    AgeBand.Tween, null -> TweenRadii
}

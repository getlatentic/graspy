package com.latentic.graspy.subjects

import androidx.annotation.DrawableRes
import com.latentic.graspy.R
import com.latentic.graspy.ui.AgeBand

/**
 * The learner picture a subject shows, one per age band so the learner grows with the class. As the web's
 * features/learn/lib/subject-art.ts: subject names are an open set, so patterns decide and the first match wins
 * ("Agricultural Technology" is agriculture, "Computer Science" is ICT); a subject with no picture shows its icon.
 */
enum class SubjectArt(
    private val pattern: Regex,
    @param:DrawableRes private val child: Int,
    @param:DrawableRes private val tween: Int,
    @param:DrawableRes private val teen: Int,
) {
    AGRICULTURE(Regex("""agric|farming|\bcrops?\b"""), R.drawable.art_agriculture_child, R.drawable.art_agriculture_tween, R.drawable.art_agriculture_teen),
    ICT(Regex("""\bict\b|computer|technology|coding"""), R.drawable.art_ict_child, R.drawable.art_ict_tween, R.drawable.art_ict_teen),
    MATH(Regex("""math|algebra|geometry|statistic|arithmetic|calculus"""), R.drawable.art_math_child, R.drawable.art_math_tween, R.drawable.art_math_teen),
    BUSINESS(Regex("""(?<!home )econom|commerce|business|account|financ"""), R.drawable.art_business_child, R.drawable.art_business_tween, R.drawable.art_business_teen),
    CIVIC(Regex("""civic|government|citizen|moral|political"""), R.drawable.art_civic_child, R.drawable.art_civic_tween, R.drawable.art_civic_teen),
    SCIENCE(Regex("""chemistry|science|physics|biology"""), R.drawable.art_science_child, R.drawable.art_science_tween, R.drawable.art_science_teen),
    ENGLISH(Regex("""english|literature|reading|language|grammar"""), R.drawable.art_english_child, R.drawable.art_english_tween, R.drawable.art_english_teen),
    HISTORY(Regex("""history|heritage"""), R.drawable.art_history_child, R.drawable.art_history_tween, R.drawable.art_history_teen),
    GEOGRAPHY(Regex("""geograph|social studies"""), R.drawable.art_geography_child, R.drawable.art_geography_tween, R.drawable.art_geography_teen),
    MUSIC(Regex("""music"""), R.drawable.art_music_child, R.drawable.art_music_tween, R.drawable.art_music_teen),
    PE(Regex("""physical|\bsports?\b|\bpe\b|martial"""), R.drawable.art_pe_child, R.drawable.art_pe_tween, R.drawable.art_pe_teen),
    ART(Regex("""\barts?\b|design|\bcrafts?\b|paint|drawing"""), R.drawable.art_art_child, R.drawable.art_art_tween, R.drawable.art_art_teen),
    ;

    @DrawableRes
    fun drawable(band: AgeBand): Int = when (band) {
        AgeBand.Child -> child
        AgeBand.Tween -> tween
        AgeBand.Teen -> teen
    }

    companion object {
        fun of(subjectName: String): SubjectArt? {
            val key = subjectName.lowercase()
            return entries.firstOrNull { it.pattern.containsMatchIn(key) }
        }
    }
}

package com.latentic.graspy.practice

import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.AppLanguageSelection

/** One reviewed exercise the Worker can evaluate, identified on the wire by its prompt ID. */
sealed interface PracticeExercise {
    val promptId: String
    val task: String get() = "reasoning"
    val topic: String get() = "multiplication"

    /** The teacher's notes before the learner replies, in order. */
    val promptUtterances: List<TeacherUtterance>

    data object SevenTimesEight : PracticeExercise {
        override val promptId = "mul_7x8_explain"
        override val promptUtterances = listOf(TeacherUtterance.PROMPT)
    }

    /** One spoken answer to one fact; a fact just taught is said back, a check is answered cold. */
    data class FactAnswer(val table: Int, val multiplier: Int, val taught: Boolean) : PracticeExercise {
        override val promptId = "mul_fact_${table}x${multiplier}_${if (taught) "say" else "answer"}"
        override val promptUtterances = listOfNotNull(
            TeacherUtterance.factLearn(table, multiplier).takeIf { taught },
            TeacherUtterance.factAsk(table, multiplier),
        )
        val expected: Int get() = table * multiplier
    }

    /** An activity a lesson plan defines: a spoken sequence or a spoken answer, marked by the plan. */
    data class Planned(override val promptId: String, override val task: String, override val topic: String) : PracticeExercise {
        override val promptUtterances: List<TeacherUtterance> = emptyList()
    }

    data class TimesTableRecitation(val table: Int, val multipliers: List<Int> = FULL) : PracticeExercise {
        val full: Boolean get() = multipliers == FULL
        override val promptId =
            if (full) "mul_table_${table}_recite_1_12" else "mul_table_${table}_recite_facts_${multipliers.joinToString("-")}"
        override val promptUtterances = if (full) listOf(TeacherUtterance.tablePrompt(table)) else
            listOf(TeacherUtterance.RETRY_FACTS) + multipliers.map { TeacherUtterance.factAsk(table, it) }

        companion object {
            val FULL: List<Int> = (1..12).toList()
            val TABLE_1 = TimesTableRecitation(table = 1)
        }
    }

    companion object {
        /** The exercise behind a plan activity: an existing marker by prompt id, or the plan's own. */
        fun forActivity(activity: LessonActivity, subject: String): PracticeExercise = when (activity.kind) {
            "existing" -> fromPromptId(activity.promptId)
            "sequence" -> Planned(activity.promptId, task = "recitation", topic = subject)
            else -> Planned(activity.promptId, task = "reasoning", topic = subject)
        }

        fun fromPromptId(promptId: String, task: String = "reasoning", topic: String = "multiplication"): PracticeExercise {
            if (promptId.startsWith("plan.") || promptId.startsWith("repair.")) return Planned(promptId, task, topic)
            FACT_PROMPT.matchEntire(promptId)?.destructured?.let { (table, fact, mode) ->
                return FactAnswer(table.toInt(), fact.toInt(), taught = mode == "say")
            }
            val match = requireNotNull(TABLE_PROMPT.matchEntire(promptId)) { "Unknown lesson prompt: $promptId" }
            val (table, range) = match.destructured
            val facts = if (range == "1_12") TimesTableRecitation.FULL else range.removePrefix("facts_").split("-").map(String::toInt)
            return TimesTableRecitation(table.toInt(), facts)
        }

        private val FACT_PROMPT = Regex("""mul_fact_(\d+)x(\d+)_(say|answer)""")
        private val TABLE_PROMPT = Regex("""mul_table_(\d+)_recite_(1_12|facts_[\d-]+)""")
    }
}

/** Dataset language pair for the learner's app language; English is labelled as Nigerian English + Pidgin. */
fun AppLanguage.practiceLanguagePair(): String = when (this) {
    AppLanguage.YORUBA -> "yo-en"
    AppLanguage.ENGLISH, AppLanguage.PIDGIN -> "pcm-en"
}

/**
 * The language the learner actually speaks in Practise. The Worker picks Intron's recognizer from
 * this: on device the Yoruba and Pidgin models collapsed an English recitation into digit runs,
 * while the English model transcribed the same recording almost verbatim.
 */
fun AppLanguage.spokenLanguage(): String = when (this) {
    AppLanguage.ENGLISH -> "en"
    AppLanguage.YORUBA -> "yo"
    AppLanguage.PIDGIN -> "pcm"
}

/** What the sample declares: nothing when the learner left it to graspy, so the Worker detects it. */
fun AppLanguageSelection.declaredSpokenLanguage(): String? = when (this) {
    AppLanguageSelection.SYSTEM -> null
    AppLanguageSelection.ENGLISH -> "en"
    AppLanguageSelection.YORUBA -> "yo"
    AppLanguageSelection.PIDGIN -> "pcm"
}

fun AppLanguageSelection.Companion.fromSpoken(code: String?): AppLanguageSelection? = when (code) {
    "en" -> AppLanguageSelection.ENGLISH
    "yo" -> AppLanguageSelection.YORUBA
    "pcm" -> AppLanguageSelection.PIDGIN
    else -> null
}

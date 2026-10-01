package com.latentic.graspy.practice

import com.latentic.graspy.localization.AppLanguage
import org.junit.Assert.assertEquals
import org.junit.Test

class PracticeExerciseTest {
    @Test
    fun `table one recitation uses the agreed prompt id and published utterances`() {
        val exercise = PracticeExercise.TimesTableRecitation.TABLE_1
        assertEquals("mul_table_1_recite_1_12", exercise.promptId)
        assertEquals(listOf(TeacherUtterance.TABLE_1_PROMPT), exercise.promptUtterances)
        assertEquals("table-1-prompt", exercise.promptUtterances.single().wireValue)
        assertEquals((1..12).toList(), exercise.multipliers)
    }

    @Test
    fun `a fact answer is taught then asked`() {
        val taught = PracticeExercise.FactAnswer(6, 7, taught = true)
        assertEquals("mul_fact_6x7_say", taught.promptId)
        assertEquals(listOf("fact-6-7-learn", "fact-6-7-ask"), taught.promptUtterances.map { it.wireValue })
        val check = PracticeExercise.FactAnswer(6, 7, taught = false)
        assertEquals("mul_fact_6x7_answer", check.promptId)
        assertEquals(listOf("fact-6-7-ask"), check.promptUtterances.map { it.wireValue })
        val targeted = PracticeExercise.TimesTableRecitation(2, listOf(3, 7))
        assertEquals("mul_table_2_recite_facts_3-7", targeted.promptId)
        assertEquals(listOf("retry-facts", "fact-2-3-ask", "fact-2-7-ask"), targeted.promptUtterances.map { it.wireValue })
    }

    @Test
    fun `the spoken language follows the app language and the dataset pair stays within contract`() {
        assertEquals("en", AppLanguage.ENGLISH.spokenLanguage())
        assertEquals("yo", AppLanguage.YORUBA.spokenLanguage())
        assertEquals("pcm", AppLanguage.PIDGIN.spokenLanguage())
        assertEquals("pcm-en", AppLanguage.ENGLISH.practiceLanguagePair())
        assertEquals("yo-en", AppLanguage.YORUBA.practiceLanguagePair())
    }

    @Test
    fun `a learner who left the language to graspy declares nothing and adopts what was heard`() {
        assertEquals(null, com.latentic.graspy.localization.AppLanguageSelection.SYSTEM.declaredSpokenLanguage())
        assertEquals("yo", com.latentic.graspy.localization.AppLanguageSelection.YORUBA.declaredSpokenLanguage())
        assertEquals(com.latentic.graspy.localization.AppLanguageSelection.PIDGIN, com.latentic.graspy.localization.AppLanguageSelection.fromSpoken("pcm"))
        assertEquals(null, com.latentic.graspy.localization.AppLanguageSelection.fromSpoken("fr"))
    }

    @Test
    fun `seven times eight keeps the single answer contract`() {
        assertEquals("mul_7x8_explain", PracticeExercise.SevenTimesEight.promptId)
    }

    @Test
    fun `a list asked again from where it broke is a plan prompt, not an unknown one`() {
        val prompt = "repair.mathematics.time.days-of-the-week.practice.friday"
        val exercise = PracticeExercise.fromPromptId(prompt, task = "recitation", topic = "mathematics")
        assertEquals(PracticeExercise.Planned(prompt, "recitation", "mathematics"), exercise)
        assertEquals(exercise, PracticeExercise.forActivity(LessonActivity("sequence", prompt), "mathematics"))
    }
}

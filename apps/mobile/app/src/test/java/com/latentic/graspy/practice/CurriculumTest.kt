package com.latentic.graspy.practice

import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.localization.copyFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CurriculumTest {
    @Test
    fun `each class starts at its own table and ends at twelve`() {
        assertEquals(1..12, Curriculum.tables(SchoolClass.PRIMARY_1))
        assertEquals(2..12, Curriculum.tables(SchoolClass.PRIMARY_4))
        assertEquals(6..12, Curriculum.tables(SchoolClass.JSS_1))
        assertEquals(2, Curriculum.startTable(SchoolClass.PRIMARY_4))
    }

    @Test
    fun `prompt ids carry their table for every kind of move`() {
        assertEquals(7, tableOfPrompt("mul_table_7_recite_1_12"))
        assertEquals(2, tableOfPrompt("mul_table_2_recite_facts_3-7"))
        assertEquals(6, tableOfPrompt("mul_fact_6x7_answer"))
        assertNull(tableOfPrompt("mul_7x8_explain"))
    }

    @Test
    fun `number words cover every product the teacher says`() {
        assertEquals(listOf("zero", "twelve", "twenty", "fifty-six", "one hundred", "one hundred and forty-four"), listOf(0, 12, 20, 56, 100, 144).map(::numberWords))
    }

    @Test
    fun `lesson copy is resolved per table with english number words in every mode`() {
        val en = copyFor(AppLanguage.ENGLISH).lesson.forTable(7)
        assertEquals("The seven times table", en.title)
        assertTrue(en.teacherPrompt.startsWith("Now the seven times table."))
        assertTrue(copyFor(AppLanguage.ENGLISH).lesson.forTable(1).teacherPrompt.startsWith("Recite the one times table"))
        assertEquals("Table seven", copyFor(AppLanguage.YORUBA).lesson.forTable(7).threadSubtitle)
        assertEquals("You know the seven times table now. Well done.", en.masteredTable)
    }
}

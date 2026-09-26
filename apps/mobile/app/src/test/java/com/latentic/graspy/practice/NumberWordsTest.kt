package com.latentic.graspy.practice

import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.copyFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NumberWordsTest {
    @Test
    fun `number words cover every product the teacher says`() {
        assertEquals(listOf("zero", "twelve", "twenty", "fifty-six", "one hundred", "one hundred and forty-four"), listOf(0, 12, 20, 56, 100, 144).map(::numberWords))
    }

    @Test
    fun `her words name the table in the words she says it in, and in digits in Arabic`() {
        assertEquals(
            "I couldn't hear the seven times table. Say it again slowly.",
            copyFor(InterfaceLanguage.ENGLISH).lesson.forTable(7).notUnderstoodFeedback,
        )
        assertTrue(copyFor(InterfaceLanguage.YORUBA).lesson.forTable(7).notUnderstoodFeedback.contains("seven"))
        assertTrue(copyFor(InterfaceLanguage.ARABIC).lesson.forTable(7).notUnderstoodFeedback.contains("7"))
    }
}

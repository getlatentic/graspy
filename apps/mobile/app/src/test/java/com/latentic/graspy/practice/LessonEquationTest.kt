package com.latentic.graspy.practice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LessonEquationTest {
    @Test
    fun `a fact being checked is written as a question`() {
        assertEquals("1 × 4 = ?", equationFor(PracticeExercise.FactAnswer(1, 4, taught = false), answeredCorrectly = false))
    }

    @Test
    fun `the answer is never on the board while the child is asked for it, even just after it was taught`() {
        assertEquals("2 × 7 = ?", equationFor(PracticeExercise.FactAnswer(2, 7, taught = true), answeredCorrectly = false))
    }

    @Test
    fun `a correct answer fills in the product`() {
        assertEquals("1 × 4 = 4", equationFor(PracticeExercise.FactAnswer(1, 4, taught = false), answeredCorrectly = true))
    }

    @Test
    fun `a whole table and no exercise have no single equation`() {
        assertNull(equationFor(PracticeExercise.TimesTableRecitation(table = 2), answeredCorrectly = false))
        assertNull(equationFor(null, answeredCorrectly = false))
    }
}

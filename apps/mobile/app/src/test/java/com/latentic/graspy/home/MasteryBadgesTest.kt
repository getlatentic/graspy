package com.latentic.graspy.home

import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.copyFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MasteryBadgesTest {
    private fun lesson(planId: String, standing: LessonStanding, daysCorrect: Int = 0) =
        CatalogueLesson(planId, "mathematics", "multiplication", planId, standing, current = false, daysCorrect = daysCorrect)

    private val classLessons = listOf(
        lesson("table-1", LessonStanding.MASTERED, daysCorrect = 2),
        lesson("table-2", LessonStanding.LEARNT, daysCorrect = 1),
        lesson("table-3", LessonStanding.MASTERED, daysCorrect = 3),
        lesson("table-4", LessonStanding.STARTED),
        lesson("table-5", LessonStanding.UNTOUCHED),
    )

    @Test
    fun `a badge is won for every lesson mastered, in the order the class teaches them`() {
        assertEquals(listOf("table-1", "table-3"), classLessons.masteryShelf().badges.map { it.planId })
        assertEquals(listOf("table-3", "table-1"), classLessons.reversed().masteryShelf().badges.map { it.planId })
    }

    @Test
    fun `learnt is not yet a badge, because mastery is two different days`() {
        val nearly = classLessons.map { it.copy(standing = LessonStanding.LEARNT) }.masteryShelf()

        assertTrue(nearly.badges.isEmpty())
    }

    @Test
    fun `the nearest badge is the unwon lesson with the most good days`() {
        assertEquals("table-2", classLessons.masteryShelf().nearest?.planId)
    }

    @Test
    fun `a lesson never answered correctly is not near a badge, so nothing is promised`() {
        val untried = listOf(lesson("table-4", LessonStanding.STARTED), lesson("table-5", LessonStanding.UNTOUCHED))

        assertNull(untried.masteryShelf().nearest)
        assertEquals(MasteryShelf(emptyList(), null), emptyList<CatalogueLesson>().masteryShelf())
    }

    @Test
    fun `what wins the next badge reads in the learner's language`() {
        val nearest = requireNotNull(classLessons.masteryShelf().nearest).title

        assertEquals(
            "One more good day on table-2 wins its badge.",
            copyFor(InterfaceLanguage.ENGLISH).home.oneMoreDay.format(nearest),
        )
        assertEquals(
            "One more better day for table-2 go win im badge.",
            copyFor(InterfaceLanguage.PIDGIN).home.oneMoreDay.format(nearest),
        )
        assertTrue(copyFor(InterfaceLanguage.YORUBA).home.oneMoreDay.format(nearest).contains("table-2"))
    }
}

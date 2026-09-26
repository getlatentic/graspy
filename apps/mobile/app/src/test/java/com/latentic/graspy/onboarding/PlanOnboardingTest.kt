package com.latentic.graspy.onboarding

import com.latentic.graspy.plan.GeneratedSubject
import com.latentic.graspy.plan.Names
import com.latentic.graspy.plan.SchoolLevel
import com.latentic.graspy.plan.SchoolStage
import com.latentic.graspy.plan.SchoolSystem
import com.latentic.graspy.plan.schoolDescriptor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The details and subjects onboarding asks for, as the web's onboarding reads them. */
class PlanOnboardingTest {
    private val nigeria = SchoolSystem(
        id = "NG", country = "NG", name = Names("Nigeria"), main = true,
        stages = listOf(SchoolStage("jss", Names("Junior Secondary School"))),
        levels = listOf(SchoolLevel("jss-1", "jss", Names("JSS 1"), listOf("JS1"), 12)),
    )

    @Test
    fun `a school class names the level as the server reads it`() {
        assertEquals("JSS 1 (Junior Secondary School), Nigeria, age 12", schoolDescriptor(nigeria, nigeria.levels.single()))
        val form = DetailsForm("NG", "en", "NG", "jss-1", SchoolChoice(Names("JSS 1"), "JSS 1 (Junior Secondary School), Nigeria, age 12"))

        assertTrue(form.complete)
        assertEquals("JSS 1 (Junior Secondary School), Nigeria, age 12", form.details().gradeLevel)
    }

    @Test
    fun `a level after school needs a course, which names it`() {
        val form = DetailsForm("NG", "en", "NG", "undergraduate")
        assertFalse(form.complete)

        val withCourse = form.copy(course = " Accounting ")
        assertTrue(withCourse.complete)
        assertEquals("Undergraduate student, studying Accounting", withCourse.details().gradeLevel)
        assertEquals("", withCourse.details().system)
    }

    @Test
    fun `nothing is complete without a country, a language and a class`() {
        assertFalse(DetailsForm().complete)
        assertFalse(DetailsForm("NG", "en", "NG", "jss-1").complete)
    }

    @Test
    fun `the recommended subjects start chosen, and no more than the limit can be`() {
        val found = listOf(GeneratedSubject("maths", "Mathematics", true), GeneratedSubject("art", "Art", false))
        assertEquals(listOf("maths"), seededSelection(found))

        val full = List(SUBJECT_SELECTION_LIMIT) { "s$it" }
        assertEquals(full, toggledSelection(full, "one-more"))
        assertEquals(full - "s0", toggledSelection(full, "s0"))
    }

    @Test
    fun `a class is found by any name it goes by`() {
        val options = listOf(SelectOption("jss-1", "JSS 1", keywords = listOf("JS1")), SelectOption("sss-1", "SS 1"))
        assertEquals(listOf("jss-1"), matchingOptions(options, "j.s. 1").map { it.value })
        assertEquals(listOf("jss-1"), matchingOptions(options, "js1").map { it.value })
    }
}

package com.latentic.graspy.you

import com.latentic.graspy.plan.LearnerDetails
import com.latentic.graspy.plan.Names
import org.junit.Assert.assertEquals
import org.junit.Test

/** What saving new details does to the plan, as the web's detailsSave decides it. */
class DetailsSaveTest {
    private fun inClass(level: String, name: String) =
        LearnerDetails("NG", "en", "NG", level, Names(name), "", "$name, Nigeria")

    private val nursery = inClass("nursery-2", "Nursery 2")
    private val primary = inClass("primary-2", "Primary 2")

    @Test
    fun `a class that learns by voice alone keeps the plan, subjects and all`() {
        assertEquals(DetailsSave.KEEP, detailsSave(nursery, planHasSubjects = true))
        assertEquals(DetailsSave.KEEP, detailsSave(nursery.copy(language = "yo"), planHasSubjects = false))
    }

    @Test
    fun `a plan with no subjects to keep is made anew`() {
        assertEquals(DetailsSave.NEW, detailsSave(primary, planHasSubjects = false))
    }

    @Test
    fun `a learner with subjects chooses, even leaving a class that learns by voice alone (Primary 2 to Nursery 2 and back)`() {
        assertEquals(DetailsSave.ASK, detailsSave(primary, planHasSubjects = true))
    }
}

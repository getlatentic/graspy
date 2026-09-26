package com.latentic.graspy.you

import com.latentic.graspy.plan.LearnerDetails
import com.latentic.graspy.plan.Names
import org.junit.Assert.assertEquals
import org.junit.Test

/** What saving new details does to the plan, as the web's detailsSave decides it. */
class DetailsSaveTest {
    private fun inClass(level: String, name: String) =
        LearnerDetails("NG", "en", "NG", level, Names(name), "", "$name, Nigeria")

    private val nursery = inClass("nursery-1", "Nursery 1")
    private val primary = inClass("primary-1", "Primary 1")
    private val jss = inClass("jss-1", "JSS 1")

    @Test
    fun `a learner between classes that learn from slides chooses a new plan or theirs`() {
        assertEquals(DetailsSave.ASK, detailsSave(jss, primary))
    }

    @Test
    fun `a class that learns by voice alone keeps the plan, with no subjects to make`() {
        assertEquals(DetailsSave.KEEP, detailsSave(primary, nursery))
        assertEquals(DetailsSave.KEEP, detailsSave(nursery, nursery.copy(language = "yo")))
    }

    @Test
    fun `a learner leaving such a class gets a new plan, theirs having no subjects`() {
        assertEquals(DetailsSave.NEW, detailsSave(nursery, primary))
    }
}

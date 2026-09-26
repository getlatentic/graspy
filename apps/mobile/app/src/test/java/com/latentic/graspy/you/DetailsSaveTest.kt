package com.latentic.graspy.you

import com.latentic.graspy.onboarding.DetailsForm
import com.latentic.graspy.onboarding.SchoolChoice
import com.latentic.graspy.plan.Names
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** What saving new details does to the plan, as the web's detailsSave decides it. */
class DetailsSaveTest {
    // A class chosen from the catalogue carries its word on learning by voice alone.
    private fun chosen(level: String, voiceOnly: Boolean) =
        DetailsForm("NG", "en", "NG", level, SchoolChoice(Names(level), level, voiceOnly))

    // The class the learner already has, filled from their plan.
    private val kept = DetailsForm("NG", "en", "NG", "jss-1", SchoolChoice(Names("JSS 1"), "JSS 1"))

    @Test
    fun `a class that learns by voice alone keeps the plan, subjects and all`() {
        assertEquals(DetailsSave.KEEP, detailsSave(voiceOnly = true, planHasSubjects = true))
        assertEquals(DetailsSave.KEEP, detailsSave(voiceOnly = true, planHasSubjects = false))
    }

    @Test
    fun `a plan with no subjects to keep is made anew`() {
        assertEquals(DetailsSave.NEW, detailsSave(voiceOnly = false, planHasSubjects = false))
    }

    @Test
    fun `a learner with subjects chooses, even leaving a class that learns by voice alone (Primary 2 to Nursery 2 and back)`() {
        assertEquals(DetailsSave.ASK, detailsSave(voiceOnly = false, planHasSubjects = true))
    }

    @Test
    fun `a class chosen from the catalogue learns by voice alone as the catalogue says, never by its name`() {
        assertTrue(chosen("nursery-2", voiceOnly = true).learnsByVoiceAlone(now = false))
        assertFalse(chosen("nursery-2", voiceOnly = false).learnsByVoiceAlone(now = true))
    }

    @Test
    fun `the learner's own class learns as the server last said, and a level after school never by voice alone`() {
        assertTrue(kept.learnsByVoiceAlone(now = true))
        assertFalse(kept.learnsByVoiceAlone(now = false))
        assertFalse(DetailsForm("NG", "en", "", "graduate", null, "Law").learnsByVoiceAlone(now = true))
    }
}

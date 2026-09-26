package com.latentic.graspy.ui

import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.plan.LearnerPlan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Which voice lessons a learner's app shows: their plan's class, or the device's while the plan cannot be read. */
class VoiceShownTest {
    private val nursery = LearnerProfile(SchoolClass.NURSERY_1, AppLanguageSelection.YORUBA)
    private val jss = LearnerProfile(SchoolClass.JSS_1, AppLanguageSelection.ENGLISH)

    @Test
    fun `a plan for a class with voice lessons shows them`() {
        assertEquals(nursery, voiceShown(nursery, LearnerPlan(planId = "p", system = "NG", level = "nursery-1")))
    }

    @Test
    fun `a plan for a class without voice lessons shows none`() {
        assertNull(voiceShown(nursery, LearnerPlan(planId = "p", system = "NG", level = "jss-1")))
    }

    @Test
    fun `with the plan unread the device's class shows its voice lessons`() {
        assertEquals(nursery, voiceShown(nursery, ready = null))
    }

    @Test
    fun `with the plan unread a device class without voice lessons shows none`() {
        assertNull(voiceShown(jss, ready = null))
    }

    @Test
    fun `a device with no class shows none`() {
        assertNull(voiceShown(null, ready = null))
    }
}

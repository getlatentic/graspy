package com.latentic.graspy.localization

import com.latentic.graspy.practice.Teacher
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.voiceClass
import com.latentic.graspy.plan.voiceLanguage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LearnerProfileTest {
    @Test
    fun `school classes round trip through their wire values`() {
        SchoolClass.entries.forEach { assertEquals(it, SchoolClass.fromWire(it.wireValue)) }
        assertNull(SchoolClass.fromWire("grade_4"))
        assertEquals("primary_4", SchoolClass.PRIMARY_4.wireValue)
    }

    @Test
    fun `a Nigerian primary class gets voice lessons in the teacher's nearest language`() {
        val plan = LearnerPlan(planId = "plan-1", system = "NG", level = "primary-4", languageCode = "yo")

        assertEquals(SchoolClass.PRIMARY_4, plan.voiceClass())
        assertEquals(AppLanguageSelection.YORUBA, plan.voiceLanguage())
        assertEquals(AppLanguageSelection.PIDGIN, plan.copy(languageCode = "pcm").voiceLanguage())
        assertEquals(AppLanguageSelection.ENGLISH, plan.copy(languageCode = "ha").voiceLanguage())
    }

    @Test
    fun `Nigeria's nursery and kindergarten classes get voice lessons, as on the web`() {
        val plan = LearnerPlan(planId = "plan-1", system = "NG")

        assertEquals(SchoolClass.NURSERY_1, plan.copy(level = "nursery-1").voiceClass())
        assertEquals(SchoolClass.NURSERY_2, plan.copy(level = "nursery-2").voiceClass())
        assertEquals(SchoolClass.KINDERGARTEN, plan.copy(level = "kindergarten").voiceClass())
    }

    @Test
    fun `other classes and other countries have no voice lessons`() {
        assertNull(LearnerPlan(planId = "plan-1", system = "NG", level = "jss-1").voiceClass())
        assertNull(LearnerPlan(planId = "plan-1", system = "NG", level = "sss-2").voiceClass())
        assertNull(LearnerPlan(planId = "plan-1", system = "GH", level = "kindergarten").voiceClass())
        assertNull(LearnerPlan(planId = "plan-1", system = "SK", level = "primary-4").voiceClass())
        assertNull(LearnerPlan(planId = "plan-1", gradeLevel = "Primary 4").voiceClass())
    }

    @Test
    fun `primary classes get one class teacher`() {
        SchoolClass.entries.filter { it.primary }.forEach {
            assertEquals(listOf(Teacher.AUNTY_CHIOMA), Teacher.forClass(it))
        }
        assertEquals(Teacher.all, Teacher.forClass(SchoolClass.JSS_1))
    }
}

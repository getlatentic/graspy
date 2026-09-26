package com.latentic.graspy.localization

import com.latentic.graspy.practice.Teacher
import com.latentic.graspy.ui.onboardingProfile
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
    fun `onboarding needs both answers before a profile exists`() {
        assertNull(onboardingProfile(SchoolClass.PRIMARY_4, null))
        assertNull(onboardingProfile(null, AppLanguageSelection.YORUBA))
        assertEquals(
            LearnerProfile(SchoolClass.PRIMARY_4, AppLanguageSelection.YORUBA),
            onboardingProfile(SchoolClass.PRIMARY_4, AppLanguageSelection.YORUBA),
        )
    }

    @Test
    fun `primary classes get one class teacher`() {
        SchoolClass.entries.filter { it.primary }.forEach {
            assertEquals(listOf(Teacher.AUNTY_CHIOMA), Teacher.forClass(it))
        }
        assertEquals(Teacher.all, Teacher.forClass(SchoolClass.JSS_1))
    }
}

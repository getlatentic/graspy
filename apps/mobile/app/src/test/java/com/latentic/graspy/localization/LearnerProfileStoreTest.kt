package com.latentic.graspy.localization

import com.latentic.graspy.account.PreferenceFiles
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class LearnerProfileStoreTest {
    private val context = RuntimeEnvironment.getApplication()
    private val profiles = LearnerProfileStore(context)
    private val ada = LearnerProfile(SchoolClass.PRIMARY_3, AppLanguageSelection.YORUBA)
    private val bayo = LearnerProfile(SchoolClass.JSS_1, AppLanguageSelection.PIDGIN)

    @Test
    fun `each learner keeps their own class and language`() {
        profiles.save("uid-1/ada", ada)
        profiles.save("uid-1/bayo", bayo)

        assertEquals(ada, profiles.load("uid-1/ada"))
        assertEquals(bayo, profiles.load("uid-1/bayo"))
        assertEquals("jss_1", profiles.learnerClass("uid-1/bayo"))
    }

    @Test
    fun `a learner new to this device has none, so they are asked`() {
        profiles.save("uid-1/ada", ada)

        assertNull(profiles.load("uid-1/tolu"))
        assertNull(profiles.load("uid-2/ada"))
    }

    @Test
    fun `the class and language chosen before accounts held learners go to the first learner, once`() {
        keptBeforeLearners(SchoolClass.PRIMARY_4, "pcm")

        assertTrue(profiles.holdsDeviceProfile())
        profiles.claimDeviceProfile("uid-1/ada")
        profiles.claimDeviceProfile("uid-1/bayo")

        assertEquals(LearnerProfile(SchoolClass.PRIMARY_4, AppLanguageSelection.PIDGIN), profiles.load("uid-1/ada"))
        assertNull(profiles.load("uid-1/bayo"))
        assertFalse(profiles.holdsDeviceProfile())
    }

    @Test
    fun `a learner who already learned here keeps their own over the device's`() {
        profiles.save("uid-1/ada", ada)
        keptBeforeLearners(SchoolClass.PRIMARY_1, "en")

        profiles.claimDeviceProfile("uid-1/ada")

        assertEquals(ada, profiles.load("uid-1/ada"))
    }

    @Test
    fun `forgetting a learner forgets only theirs`() {
        profiles.save("uid-1/ada", ada)
        profiles.save("uid-1/bayo", bayo)

        profiles.forget("uid-1/ada")

        assertNull(profiles.load("uid-1/ada"))
        assertEquals(bayo, profiles.load("uid-1/bayo"))
    }

    private fun keptBeforeLearners(schoolClass: SchoolClass, language: String) {
        context.getSharedPreferences(PreferenceFiles.PROFILES, 0).edit().putString("school_class", schoolClass.wireValue).commit()
        context.getSharedPreferences(PreferenceFiles.DEVICE_LANGUAGE, 0).edit().putString("app_language", language).commit()
    }
}

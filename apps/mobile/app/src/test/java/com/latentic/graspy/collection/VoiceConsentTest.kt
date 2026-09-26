package com.latentic.graspy.collection

import com.latentic.graspy.localization.LearnerProfileStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** The voice note: shown once per learner, before anything of theirs is recorded. */
@RunWith(RobolectricTestRunner::class)
class VoiceConsentTest {
    private val profiles = LearnerProfileStore(RuntimeEnvironment.getApplication())
    private var learner: String? = ADA
    private val consent = VoiceConsent(profiles) { learner }

    @Test
    fun `the note shows once for a learner`() {
        assertTrue(consent.needed())

        consent.accept()

        assertFalse(consent.needed())
        assertFalse(VoiceConsent(profiles) { ADA }.needed())
    }

    @Test
    fun `another learner sees it again, and the first keeps theirs across the switch`() {
        consent.accept()

        learner = BAYO
        assertTrue(consent.needed())

        learner = ADA
        assertFalse(consent.needed())
    }

    @Test
    fun `nothing records before the note is accepted`() {
        var recordings = 0

        assertFalse(consent.whenSeen { recordings++ })
        assertEquals(0, recordings)

        consent.accept()
        assertTrue(consent.whenSeen { recordings++ })
        assertEquals(1, recordings)
    }

    @Test
    fun `with no learner in use nothing records`() {
        learner = null

        assertTrue(consent.needed())
        assertFalse(consent.whenSeen { error("recorded with no learner") })
    }

    @Test
    fun `signing out forgets it, so the next learner here is told again`() {
        consent.accept()

        profiles.forgetAll()

        assertTrue(consent.needed())
    }

    private companion object {
        const val ADA = "uid-1/ada"
        const val BAYO = "uid-1/bayo"
    }
}

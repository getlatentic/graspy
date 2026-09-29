package com.latentic.graspy.ui

import com.latentic.graspy.account.ADA
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Signing out leaves no settings screen of the last account, nor a learner's recordings, for the next. */
class AccountScreensTest {
    @Test
    fun `signing out returns to learning and forgets whose recordings were shown`() {
        val screens = AccountScreens()
        screens.showRecordingsOf(ADA)
        assertEquals(AccountScreen.RECORDINGS, screens.screen.value)
        assertEquals(ADA, screens.recordingsOf.value)

        screens.reset()

        assertEquals(AccountScreen.LEARNING, screens.screen.value)
        assertNull(screens.recordingsOf.value)
    }
}

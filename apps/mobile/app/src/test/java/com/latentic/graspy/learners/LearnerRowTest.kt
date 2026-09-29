package com.latentic.graspy.learners

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.AGREED
import com.latentic.graspy.account.KeptRecordingsDto
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.accountCopyFor
import com.latentic.graspy.ui.GraspyTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** A learner's row on the learners screen leads to their voice recordings; a rename keeps what graspy holds for them. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class LearnerRowTest {
    @get:Rule
    val compose = createComposeRule()

    private val copy = accountCopyFor(InterfaceLanguage.ENGLISH)

    @Test
    fun `the row has the learner's name and a way to their recordings`() {
        var opened = 0
        compose.setContent {
            GraspyTheme(InterfaceLanguage.ENGLISH) {
                LearnerRow(copy, ADA, inUse = false, busy = false, onRename = { _, _ -> }, onRemove = {}, onRecordings = { opened += 1 })
            }
        }

        compose.onNodeWithText("Ada").assertIsDisplayed()
        compose.onNodeWithText("Recordings").performClick()

        assertEquals(1, opened)
    }

    @Test
    fun `a rename's answer, which carries no consents, keeps the consents the list held`() {
        val held = ADA.copy(voiceConsent = KeptRecordingsDto(1, 90))
        val state = LearnersState(learners = listOf(held))

        val renamed = state.renamed(ADA.copy(name = "Ada L", serviceConsent = null, voiceConsent = null))

        assertEquals("Ada L", renamed.learners?.single()?.name)
        assertEquals(AGREED, renamed.learners?.single()?.serviceConsent)
        assertNotNull(renamed.learners?.single()?.voiceConsent)
    }
}

package com.latentic.graspy.recordings

import android.app.Application
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.auth.FakeConfirmation
import com.latentic.graspy.consent.recordingsNotice
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.accountCopyFor
import com.latentic.graspy.ui.GraspyTheme
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** What a parent sees of a learner's voice recordings. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class RecordingsScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @get:Rule
    val folder = TemporaryFolder()

    private val application: Application = RuntimeEnvironment.getApplication()
    private val copy = accountCopyFor(InterfaceLanguage.ENGLISH)
    private val parent = FakeConfirmation()
    private val api = FakeRecordingsApi()
    private val playback = FakePlayback()

    private fun show() {
        val model = RecordingsViewModel(application, VoiceKeeping(api, File(folder.root, "kept")), parent, playback)
        compose.setContent { GraspyTheme(InterfaceLanguage.ENGLISH) { RecordingsScreen(copy, LearnerDto(LEARNER, "Ada", 1L), model, onBack = {}) } }
        compose.waitUntilText("Keep recordings")
    }

    private fun ComposeContentTestRule.waitUntilText(text: String) =
        waitUntil(WAIT_MS) { onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }

    @Test
    fun `off - the switch is off and the screen says recordings go once marked, with no list`() {
        show()

        compose.onNodeWithText("Voice recordings").assertIsDisplayed()
        compose.onNodeWithText("Ada").assertIsDisplayed()
        compose.onNodeWithText("graspy deletes each recording once it has marked the answer. The words it heard stay.").assertIsDisplayed()
        compose.onNode(isToggleable()).assertIsOff()
        assertTrue(compose.onAllNodesWithText("Play").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun `on with recordings - the days, and each recording with its date, lesson and length, to play or delete`() {
        api.consent = VoiceConsentDto(1, 90, 5L)
        api.kept += listOf(kept("r-old", 1_000L, lesson = "Two times table", seconds = 65), kept("r-new", 2_000L, seconds = 4))
        api.kept.sortByDescending { it.recordedAt }

        show()

        compose.onNode(isToggleable()).assertIsOn()
        compose.onNodeWithText("Kept for 90 days.").assertIsDisplayed()
        compose.onNode(hasText("Two times table", substring = true)).assertIsDisplayed()
        compose.onNode(hasText("1:05", substring = true)).assertIsDisplayed()
        assertEquals(2, compose.onAllNodesWithText("Play").fetchSemanticsNodes().size)
        assertEquals(2, compose.onAllNodesWithText("Delete").fetchSemanticsNodes().size)
        compose.onNodeWithText("Delete all").assertIsDisplayed()
    }

    @Test
    fun `on with none kept yet - the screen says so`() {
        api.consent = VoiceConsentDto(1, 30, 5L)

        show()

        compose.onNodeWithText("No recordings yet.").assertIsDisplayed()
        assertTrue(compose.onAllNodesWithText("Delete all").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun `the switch opens the recordings notice with 30 days chosen, and choosing days changes the notice`() {
        show()

        compose.onNode(isToggleable()).performClick()

        compose.onNodeWithText(recordingsNotice(30)).assertIsDisplayed()
        compose.onNodeWithText("Agree with Google").assertIsDisplayed()
        compose.onNodeWithText("365 days").performClick()
        compose.onNodeWithText(recordingsNotice(365)).assertIsDisplayed()
        assertTrue(api.calls.none { it.startsWith("keep") })
    }

    @Test
    fun `agreeing signs in with Google again, sends the days chosen, and the switch is on`() {
        show()
        compose.onNode(isToggleable()).performClick()
        compose.onNodeWithText("90 days").performClick()

        compose.onNodeWithText("Agree with Google").performClick()

        compose.waitUntilText("No recordings yet.")
        assertTrue(api.calls.contains("keep:$LEARNER:1:90:${FakeConfirmation.TOKEN}"))
        compose.onNode(isToggleable()).assertIsOn()
    }

    @Test
    fun `declining the notice keeps nothing and the switch stays off`() {
        show()
        compose.onNode(isToggleable()).performClick()

        compose.onNodeWithText("Don't agree").performClick()

        compose.onNode(isToggleable()).assertIsOff()
        assertTrue(api.calls.none { it.startsWith("keep") })
    }

    @Test
    fun `turning it off with recordings kept asks whether to delete them, and stopping and deleting empties the list`() {
        api.consent = VoiceConsentDto(1, 30, 5L)
        api.kept += kept("r1", 1_000L)
        show()

        compose.onNode(isToggleable()).performClick()
        compose.onNodeWithText("Stop keeping recordings?").assertIsDisplayed()
        compose.onNodeWithText("Stop and delete them").performClick()

        compose.waitUntilText("graspy deletes each recording once it has marked the answer. The words it heard stay.")
        compose.onNode(isToggleable()).assertIsOff()
        assertTrue(api.kept.isEmpty())
    }

    @Test
    fun `delete all asks first`() {
        api.consent = VoiceConsentDto(1, 30, 5L)
        api.kept += kept("r1", 1_000L)
        show()

        compose.onNodeWithText("Delete all").performClick()
        compose.onNodeWithText("Delete all kept recordings? This can't be undone.").assertIsDisplayed()
        assertEquals(1, api.kept.size)
        compose.onNodeWithText("Delete all").performClick()

        compose.waitUntilText("No recordings yet.")
        assertTrue(api.kept.isEmpty())
    }

    private companion object {
        const val WAIT_MS = 5_000L
    }
}

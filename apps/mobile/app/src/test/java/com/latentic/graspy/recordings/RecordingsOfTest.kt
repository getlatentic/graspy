package com.latentic.graspy.recordings

import android.app.Application
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertAll
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.isNotEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.auth.FakeConfirmation
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.accountCopyFor
import com.latentic.graspy.ui.GraspyTheme
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** What a parent's screen holds of the child, a recording that plays and its file, lasts as long as the screen is in sight. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class RecordingsOfTest {
    @get:Rule
    val compose = createComposeRule()

    @get:Rule
    val folder = TemporaryFolder()

    private val application: Application = RuntimeEnvironment.getApplication()
    private val copy = accountCopyFor(InterfaceLanguage.ENGLISH)
    private val api = FakeRecordingsApi(
        listOf(kept("r-old", 1_000L, lesson = "Two times table"), kept("r-new", 2_000L)),
        VoiceConsentDto(1, 30, 5L),
    )
    private val playback = FakePlayback()
    private val cache get() = File(folder.root, "kept")
    private var shown by mutableStateOf(true)
    private val owner = object : LifecycleOwner {
        val registry = LifecycleRegistry.createUnsafe(this).apply { currentState = Lifecycle.State.RESUMED }

        override val lifecycle: Lifecycle get() = registry
    }

    private fun show() {
        compose.setContent {
            GraspyTheme(InterfaceLanguage.ENGLISH) {
                CompositionLocalProvider(LocalLifecycleOwner provides owner) {
                    if (shown) {
                        RecordingsOf(copy, LearnerDto("aaaaaaaaaaaa", "Ada", 1L), onBack = {}) {
                            RecordingsViewModel(application, VoiceKeeping(api, cache), FakeConfirmation(), playback)
                        }
                    }
                }
            }
        }
        compose.waitUntil(WAIT_MS) { compose.onAllNodesWithText("Play").fetchSemanticsNodes().size == 2 }
    }

    private fun startPlaying() {
        compose.onAllNodesWithText("Play")[0].performClick()
        compose.waitUntil(WAIT_MS) { compose.onAllNodesWithText("Stop").fetchSemanticsNodes().isNotEmpty() }
        assertEquals(1, cache.listFiles().orEmpty().size)
    }

    @Test
    fun `leaving the screen stops the recording that plays and deletes its file`() {
        show()
        startPlaying()

        shown = false
        compose.waitForIdle()

        assertTrue(playback.stops > 0)
        assertFalse(cache.exists())
    }

    @Test
    fun `the app going to the background stops the recording that plays and deletes its file`() {
        show()
        startPlaying()

        owner.registry.currentState = Lifecycle.State.CREATED
        compose.waitForIdle()

        assertTrue(playback.stops > 0)
        assertTrue(cache.listFiles().orEmpty().isEmpty())
        owner.registry.currentState = Lifecycle.State.RESUMED
        compose.waitUntil(WAIT_MS) { compose.onAllNodesWithText("Stop").fetchSemanticsNodes().isEmpty() }
    }

    @Test
    fun `coming back to the screen finds it listed anew, with nothing of the last visit`() {
        show()
        startPlaying()
        shown = false
        compose.waitForIdle()

        shown = true
        compose.waitUntil(WAIT_MS) { compose.onAllNodesWithText("Play").fetchSemanticsNodes().size == 2 }

        assertTrue(cache.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun `each Play and Delete says which recording it is for, and is at least 48dp to tap`() {
        show()

        for ((action, described) in listOf("Play" to "Play the recording of ", "Delete" to "Delete the recording of ")) {
            val names = compose.onAllNodes(hasContentDescription(described, substring = true)).fetchSemanticsNodes()
                .map { it.config[SemanticsProperties.ContentDescription].single() }
            assertEquals(action, 2, names.toSet().size)
            compose.onAllNodes(hasText(action) and hasContentDescription(described, substring = true))[0].assertHeightIsAtLeast(48.dp)
        }
    }

    @Test
    fun `Play is disabled while a delete is in flight`() {
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>().also { api.deleteGate = it }
        show()

        compose.onAllNodesWithText("Delete")[0].performClick()
        compose.waitUntil(WAIT_MS) { api.calls.any { it.startsWith("delete") } }
        compose.waitForIdle()

        compose.onAllNodesWithText("Play").assertAll(isNotEnabled())
        gate.complete(Unit)
    }

    @Test
    fun `the days to choose from are at least 48dp to tap`() {
        api.consent = null
        show()
        compose.onNodeWithText("Keep recordings").performClick()

        for (days in listOf("30 days", "90 days", "365 days")) compose.onNodeWithText(days).assertHeightIsAtLeast(48.dp)
    }

    private companion object {
        const val WAIT_MS = 5_000L
    }
}

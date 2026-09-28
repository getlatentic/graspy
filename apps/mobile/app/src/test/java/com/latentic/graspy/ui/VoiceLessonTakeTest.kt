package com.latentic.graspy.ui

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.lifecycle.Lifecycle
import com.latentic.graspy.collection.CollectionViewModel
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.localization.copyFor
import com.latentic.graspy.practice.PracticeExercise
import com.latentic.graspy.settleMain
import com.latentic.graspy.ui.VoiceLessonApp.Companion.TIMEOUT_MS
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAudioRecord.AudioRecordSourceProvider

/**
 * A child's take in a voice lesson ends unsent whenever the lesson is left or out of sight, so the microphone is never
 * open outside it; it outlives only a turn of the phone, and an answer already being saved is kept.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class VoiceLessonTakeTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val app = VoiceLessonApp(compose)
    private val nursery = LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.ENGLISH)
    private val held = HeldVoice()

    @Before
    fun open() {
        app.open()
        app.server.voiceOnly = true
        app.stored(SchoolClass.NURSERY_2, "alphabet", "english.alphabet.say", "Saying the alphabet")
    }

    @After
    fun close() {
        held.release.countDown()
        app.close()
    }

    @Test
    fun `back during a take ends it, so the microphone is never left on outside the lesson and nothing is sent as its answer`() {
        openAlphabet()
        val take = startTake()

        app.pressBack()

        app.listed("Saying the alphabet").assertExists()
        assertEndedUnsent(take)
    }

    @Test
    fun `Home or the lock during a take ends it unsent, and the lesson asks for the answer again on return`() {
        app.yourTurn(SchoolClass.NURSERY_2)
        openAlphabet()
        val take = answer()

        compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)

        assertEndedUnsent(take)
        compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        compose.waitForIdle()
        app.answerButton().assertExists()
        assertFalse(take.state.value.isRecording)
        assertFalse(app.queued())
    }

    @Test
    fun `turning the phone during a take keeps it, since the lesson is still open`() {
        app.yourTurn(SchoolClass.NURSERY_2)
        openAlphabet()
        val take = answer()

        app.turnPhone(nursery)

        assertTrue(take.state.value.isRecording)
        assertEquals(1, app.recordings().size)
        compose.onNodeWithContentDescription(copyFor(InterfaceLanguage.ENGLISH).lesson.stopAndSend).assertExists()
    }

    @Test
    fun `a take already being saved when the phone locks is kept as the child's answer`() {
        openAlphabet()
        val take = startTake(held)
        // Heard before it is held, or it would end as a take nobody spoke in.
        settleMain(TIMEOUT_MS) { take.voiceLevels.value.isNotEmpty() }
        held.holding = true
        compose.runOnUiThread { take.stopAndQueue(ALPHABET) }
        assertTrue(take.state.value.isSaving)

        compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        assertTrue(take.state.value.isSaving)
        held.release.countDown()
        settleMain(TIMEOUT_MS) { !take.state.value.isSaving }

        assertNotNull(take.state.value.queuedLocalId)
        assertTrue(app.queued())
        assertEquals(1, app.recordings().size)
    }

    private fun openAlphabet() {
        app.shown(nursery)
        app.awaitListed("Saying the alphabet")
        app.openLesson("Saying the alphabet")
    }

    /** The child's answer, begun by the lesson's own button on a step that is theirs to answer. */
    private fun answer(): CollectionViewModel {
        app.grantMicrophone(speaking)
        app.answerButton().performClick()
        val take = requireNotNull(app.collection) { "The lesson has no recorder" }
        assertTrue(take.state.value.isRecording)
        return take
    }

    /** The child's answer, begun as the lesson's button begins it once the microphone is allowed. */
    private fun startTake(source: AudioRecordSourceProvider = speaking): CollectionViewModel {
        app.grantMicrophone(source)
        val take = requireNotNull(app.collection) { "The lesson has no recorder" }
        compose.runOnUiThread { take.startRecording(ALPHABET) }
        assertTrue(take.state.value.isRecording)
        return take
    }

    private fun assertEndedUnsent(take: CollectionViewModel) {
        val ended = take.state.value
        assertFalse(ended.isRecording)
        assertFalse(ended.isSaving)
        assertNull(ended.queuedLocalId)
        assertEquals(0, take.droppedTakes.value)
        assertTrue(app.recordings().isEmpty())
        assertFalse(app.queued())
    }

    private companion object {
        val ALPHABET = PracticeExercise.Planned("english.alphabet.say", "recitation", "alphabet")
    }
}

package com.latentic.graspy.ui

import androidx.compose.ui.test.performClick
import androidx.lifecycle.Lifecycle
import com.latentic.graspy.collection.CollectionViewModel
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.practice.PracticeExercise
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
    val compose = voiceLessonRule()

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
        assertTrue(app.screenKeptOn())

        app.pressBack()

        app.listed("Saying the alphabet").assertExists()
        assertEndedUnsent(take)
        assertFalse(app.screenKeptOn())
    }

    @Test
    fun `Home or the lock during a take ends it unsent, and the lesson asks for the answer again on return`() {
        app.yourTurn(SchoolClass.NURSERY_2)
        openAlphabet()
        val take = answer()

        compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)

        assertEndedUnsent(take)
        compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        app.settle { app.shows(app.answerButton()) }
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
        app.finishButton().assertExists()
    }

    @Test
    fun `the screen stays on while the child is speaking, and only then`() {
        app.yourTurn(SchoolClass.NURSERY_2)
        openAlphabet()
        assertFalse(app.screenKeptOn())

        val take = answer()
        assertTrue(app.screenKeptOn())
        app.turnPhone(nursery)
        assertTrue(app.screenKeptOn())

        finish(take)
        assertFalse(app.screenKeptOn())
    }

    @Test
    fun `a turn of the phone that brings the language graspy heard keeps the take, sent as it began`() {
        app.yourTurn(SchoolClass.NURSERY_2)
        // Following an English phone, so the lesson names no spoken language and the Worker detects it.
        openAlphabet(LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.SYSTEM))
        val take = answer()

        // The last answer was heard as English, which the upload saved to the learner's profile.
        app.turnPhone(nursery)

        assertTrue(take.state.value.isRecording)
        finish(take)
        assertEquals(listOf("pcm-en" to null), app.queuedLanguages())
        assertEquals("en", take.state.value.spokenLanguage)
    }

    @Test
    fun `the language graspy heard reaches an open lesson, though its app language is unchanged`() {
        app.yourTurn(SchoolClass.NURSERY_2)
        openAlphabet(LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.SYSTEM))
        val recorder = requireNotNull(app.collection) { "The lesson has no recorder" }
        assertNull(recorder.state.value.spokenLanguage)

        app.learnAs(nursery)

        app.settle { recorder.state.value.spokenLanguage != null }
        assertEquals("en", recorder.state.value.spokenLanguage)
    }

    @Test
    fun `a language changed during a take is the next take's, never the one being spoken`() {
        app.yourTurn(SchoolClass.NURSERY_2)
        openAlphabet()
        val take = answer()

        app.turnPhone(LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.YORUBA), AppLanguage.YORUBA)

        assertTrue(take.state.value.isRecording)
        finish(take)
        assertEquals(listOf("pcm-en" to "en"), app.queuedLanguages())
        assertEquals("yo-en", take.state.value.languagePair)
        assertEquals("yo", take.state.value.spokenLanguage)
    }

    @Test
    fun `a take already being saved when the phone locks is kept as the child's answer`() {
        openAlphabet()
        val take = startTake(held)
        // Heard before it is held, or it would end as a take nobody spoke in.
        app.settle { take.voiceLevels.value.isNotEmpty() }
        held.holding = true
        compose.runOnUiThread { take.stopAndQueue(ALPHABET) }
        assertTrue(take.state.value.isSaving)

        compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        assertTrue(take.state.value.isSaving)
        held.release.countDown()
        app.settle { !take.state.value.isSaving }

        assertNotNull(take.state.value.queuedLocalId)
        assertTrue(app.queued())
        assertEquals(1, app.recordings().size)
    }

    private fun openAlphabet(voice: LearnerProfile = nursery) {
        app.shown(voice)
        app.awaitListed("Saying the alphabet")
        app.openLesson("Saying the alphabet")
    }

    /** The child's answer, begun by the lesson's own button on a step that is theirs to answer. */
    private fun answer(): CollectionViewModel {
        app.grantMicrophone(speaking)
        app.settle { app.shows(app.answerButton()) }
        app.answerButton().performClick()
        app.settle { app.collection?.state?.value?.isRecording == true && app.shows(app.finishButton()) }
        return requireNotNull(app.collection)
    }

    /** The child, once heard, taps to say they are done, and the take is kept to be sent. */
    private fun finish(take: CollectionViewModel) {
        app.settle { take.voiceLevels.value.isNotEmpty() }
        app.finishButton().performClick()
        app.settle { take.state.value.queuedLocalId != null && !app.shows(app.finishButton()) }
    }

    /** The child's answer, begun as the lesson's button begins it once the microphone is allowed. */
    private fun startTake(source: AudioRecordSourceProvider = speaking): CollectionViewModel {
        app.grantMicrophone(source)
        val take = requireNotNull(app.collection) { "The lesson has no recorder" }
        compose.runOnUiThread { take.startRecording(ALPHABET) }
        assertTrue(take.state.value.isRecording)
        app.settle { app.shows(app.finishButton()) }
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

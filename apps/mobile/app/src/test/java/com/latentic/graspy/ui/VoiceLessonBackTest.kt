package com.latentic.graspy.ui

import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.latentic.graspy.lesson.PLAN
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.localization.learnCopyFor
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Back from a voice lesson, by the phone's back button, finds the lesson list it was opened from. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class VoiceLessonBackTest {
    @get:Rule
    val compose = voiceLessonRule()

    private val learn = learnCopyFor(InterfaceLanguage.ENGLISH)
    private val app = VoiceLessonApp(compose)

    @Before
    fun open() = app.open()

    @After
    fun close() = app.close()

    @Test
    fun `for a class that learns by voice alone, back from a lesson is Home, its lesson list`() {
        app.server.voiceOnly = true
        app.stored(SchoolClass.NURSERY_2, "alphabet", "english.alphabet.say", "Saying the alphabet")
        app.shown(LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.ENGLISH))
        app.awaitListed("Saying the alphabet")

        app.openLesson("Saying the alphabet")
        app.listed("Letters and sounds").assertDoesNotExist()

        app.pressBack()

        app.listed("Letters and sounds").assertExists()
        app.listed("Saying the alphabet").assertExists()
        compose.onNodeWithText(learn.voice.start).assertDoesNotExist()
        assertFalse(compose.activity.onBackPressedDispatcher.hasEnabledCallbacks())
    }

    @Test
    fun `for a primary class, back from a lesson is the lesson list it opened from, not Home`() {
        app.server.plan = PLAN.copy(system = "NG", level = "primary-2")
        app.stored(SchoolClass.PRIMARY_2, "multiplication", "mathematics.table-2", "The two times table")
        app.shown(LearnerProfile(SchoolClass.PRIMARY_2, AppLanguageSelection.ENGLISH))
        // The topic to continue comes before the voice card, with a Start of its own.
        compose.onAllNodesWithText(learn.voice.start).onLast().performClick()
        app.awaitListed("The two times table")

        app.openLesson("The two times table")
        app.listed("Times tables").assertDoesNotExist()

        app.pressBack()

        app.listed("The two times table").assertExists()
        compose.onNodeWithText(learn.home.subjectsTitle).assertDoesNotExist()
    }
}

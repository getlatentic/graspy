package com.latentic.graspy.learners

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.accountCopyFor
import com.latentic.graspy.ui.GraspyTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** A switch that could not send everything asks, as sign-out does; offline it only says why, as the web does. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class ChoiceStatusTest {
    @get:Rule
    val compose = createComposeRule()

    private val copy = accountCopyFor(InterfaceLanguage.ENGLISH)
    private val taps = mutableListOf<String>()

    private fun show(problem: ChoiceProblem) = compose.setContent {
        GraspyTheme(InterfaceLanguage.ENGLISH) {
            ChoiceStatus(copy, PickerState(problem = problem), { taps += "anyway" }, { taps += "cancel" })
        }
    }

    @Test
    fun `online with changes unsent, it asks whether to switch anyway`() {
        show(ChoiceProblem.UNSENT)

        compose.onNodeWithText("Some changes haven't been sent. Switch anyway?").assertIsDisplayed()
        compose.onNodeWithText("Switch").performClick()
        compose.onNodeWithText("Cancel").performClick()
        assertEquals(listOf("anyway", "cancel"), taps)
    }

    @Test
    fun `offline, it says to connect first and offers no switch`() {
        show(ChoiceProblem.OFFLINE)

        compose.onNodeWithText("Connect to the internet first, so nothing is lost.").assertIsDisplayed()
        compose.onNodeWithText("Switch").assertDoesNotExist()
    }
}

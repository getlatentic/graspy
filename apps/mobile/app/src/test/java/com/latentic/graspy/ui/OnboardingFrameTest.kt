package com.latentic.graspy.ui

import androidx.compose.material3.Text
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import com.latentic.graspy.learners.AccountFrame
import org.robolectric.annotation.Config
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Onboarding and the account screens sit under graspy's logo, and what they hold is on screen. */
@RunWith(RobolectricTestRunner::class)
class OnboardingFrameTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the logo and the screen's content are shown`() {
        compose.setContent { GraspyTheme { OnboardingFrame { Text("Who's learning?") } } }
        compose.onNodeWithContentDescription("graspy").assertIsDisplayed()
        compose.onNodeWithText("Who's learning?").assertIsDisplayed()
    }

    @Test
    @Config(qualifiers = "w360dp-h480dp")
    fun `an account screen taller than the window scrolls to its last line`() {
        compose.setContent {
            GraspyTheme { AccountFrame { repeat(40) { Text("Line $it") } } }
        }
        compose.onNodeWithText("Line 39").performScrollTo().assertIsDisplayed()
    }
}

package com.latentic.graspy.ui

import androidx.compose.material3.Text
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
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
}

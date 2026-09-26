package com.latentic.graspy.learners

import androidx.compose.material3.Text
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.ui.GraspyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Choosing and adding a learner lead into onboarding under the same header it has. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class AccountFrameTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `a learner is chosen or added under graspy's header`() {
        compose.setContent {
            GraspyTheme(InterfaceLanguage.ENGLISH) {
                AccountFrame { Text("Who's learning?") }
            }
        }

        compose.onNodeWithContentDescription("graspy").assertIsDisplayed()
        compose.onNodeWithText("Who's learning?").assertIsDisplayed()
    }
}

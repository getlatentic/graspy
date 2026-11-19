package com.latentic.graspy.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
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

/** The question, its line and the one way in are on screen held upright and held across, and the way in works. */
@RunWith(RobolectricTestRunner::class)
class SignInScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val copy = accountCopyFor(InterfaceLanguage.ENGLISH)

    private fun show(state: SignInState = SignInState(), onSignIn: () -> Unit = {}) =
        compose.setContent { GraspyTheme { SignInScreen(copy, state, onSignIn) } }

    @Test
    fun `held upright it asks, explains and offers Google`() {
        show()
        compose.onNodeWithText(copy.ready).assertIsDisplayed()
        compose.onNodeWithText(copy.signInPrompt).assertIsDisplayed()
        compose.onNodeWithText(copy.signIn).assertIsDisplayed()
    }

    @Test
    @Config(qualifiers = "w891dp-h411dp-land")
    fun `held across it shows the same words beside the picture`() {
        show()
        compose.onNodeWithText(copy.ready).assertIsDisplayed()
        compose.onNodeWithText(copy.signInPrompt).assertIsDisplayed()
        compose.onNodeWithText(copy.signIn).assertIsDisplayed()
    }

    @Test
    fun `tapping Google signs in`() {
        var taps = 0
        show(onSignIn = { taps++ })
        compose.onNodeWithText(copy.signIn).performClick()
        assertEquals(1, taps)
    }

    @Test
    fun `while signing in the button says so and waits`() {
        show(SignInState(busy = true))
        compose.onNodeWithText(copy.signingIn).assertIsNotEnabled()
    }

    @Test
    fun `a failed sign-in says so`() {
        show(SignInState(failed = true))
        compose.onNodeWithText(copy.signInFailed).assertIsDisplayed()
    }
}

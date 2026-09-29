package com.latentic.graspy.learners

import android.app.Application
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.Account
import com.latentic.graspy.account.AccountStore
import com.latentic.graspy.account.BAYO
import com.latentic.graspy.account.CARA
import com.latentic.graspy.account.ChosenLearner
import com.latentic.graspy.account.FakeAccountApi
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.account.ServiceConsents
import com.latentic.graspy.account.UID
import com.latentic.graspy.account.accountStore
import com.latentic.graspy.auth.FakeConfirmation
import com.latentic.graspy.consent.SERVICE_NOTICE
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.accountCopyFor
import com.latentic.graspy.ui.GraspyTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** What a parent sees before graspy teaches a learner: the notice, unchanged, and Google's sign-in to agree. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class ConsentScreensTest {
    @get:Rule
    val compose = createComposeRule()

    private val copy = accountCopyFor(InterfaceLanguage.ENGLISH)
    private val application: Application = RuntimeEnvironment.getApplication()
    private val api = FakeAccountApi(listOf(ADA, CARA))
    private val parent = FakeConfirmation()

    @Test
    fun `adding a learner shows the service notice in place of the guardian tick box, and agreeing needs a name`() {
        val agreedFor = mutableListOf<String>()
        compose.setContent {
            GraspyTheme(InterfaceLanguage.ENGLISH) { AddLearnerForm(copy, busy = false, onAgree = { agreedFor += it }, onCancel = {}) }
        }

        compose.onNodeWithText(SERVICE_NOTICE).assertIsDisplayed()
        compose.onNodeWithText("I'm this learner, or their parent or guardian").assertDoesNotExist()
        compose.onNodeWithText("I agree").assertIsNotEnabled()
        compose.onNodeWithText("Name").performTextInput("  Tolu ")
        compose.onNodeWithText("I agree").assertIsEnabled().performClick()

        assertEquals(listOf("Tolu"), agreedFor)
    }

    @Test
    fun `a parent who does not agree while adding leaves the form, and nothing is added`() {
        var cancelled = 0
        val agreedFor = mutableListOf<String>()
        compose.setContent {
            GraspyTheme(InterfaceLanguage.ENGLISH) { AddLearnerForm(copy, busy = false, onAgree = { agreedFor += it }, onCancel = { cancelled += 1 }) }
        }

        compose.onNodeWithText("Agree as the learner, or their parent or guardian. You'll sign in with Google again to confirm it's you.").assertIsDisplayed()
        compose.onNodeWithText("Don't agree").performClick()

        assertEquals(1, cancelled)
        assertTrue(agreedFor.isEmpty())
    }

    @Test
    fun `a learner's tile says their parent has not agreed yet, and the tile of one agreed for says nothing of it`() {
        compose.setContent {
            GraspyTheme(InterfaceLanguage.ENGLISH) {
                Column {
                    LearnerTile(CARA, inUse = false, copy = copy, enabled = true) {}
                    LearnerTile(ADA, inUse = true, copy = copy, enabled = true) {}
                    LearnerTile(BAYO, inUse = false, copy = copy, enabled = true) {}
                }
            }
        }

        compose.onNodeWithText("Not agreed yet").assertIsDisplayed()
        compose.onNodeWithText("Learning on this device").assertIsDisplayed()
        assertEquals(1, compose.onAllNodesWithText("Not agreed yet").fetchSemanticsNodes().size)
    }

    @Test
    fun `a learner not agreed for stays behind the notice until their parent signs in again and agrees`() {
        val accounts = inUse(CARA)
        var switched = 0
        showGate(accounts) { switched += 1 }

        compose.waitUntil(WAIT_MS) { compose.onAllNodesWithText(SERVICE_NOTICE).fetchSemanticsNodes().size == 1 }
        compose.onNodeWithText("Let Cara use graspy?").assertIsDisplayed()
        compose.onNodeWithText("Agree as the learner, or their parent or guardian. You'll sign in with Google again to confirm it's you.").assertIsDisplayed()
        compose.onNodeWithText("Lessons").assertDoesNotExist()
        compose.onNodeWithText("I agree").performClick()

        compose.waitUntil(WAIT_MS) { compose.onAllNodesWithText("Lessons").fetchSemanticsNodes().size == 1 }
        assertEquals(listOf("agree:${CARA.id}:1:${FakeConfirmation.TOKEN}"), api.calls)
        assertEquals(0, switched)
    }

    @Test
    fun `a parent who does not agree can only decline, which leaves for choosing a learner`() {
        val accounts = inUse(CARA)
        var switched = 0
        showGate(accounts) { switched += 1 }
        compose.waitUntil(WAIT_MS) { compose.onAllNodesWithText(SERVICE_NOTICE).fetchSemanticsNodes().size == 1 }

        compose.onNodeWithText("Don't agree").performClick()

        assertEquals(1, switched)
        compose.onNodeWithText("Lessons").assertDoesNotExist()
        assertTrue(api.calls.isEmpty())
    }

    @Test
    fun `a learner already agreed for opens at once, with no question asked of graspy`() {
        val accounts = accountStore(Account(UID, null, ChosenLearner(ADA.id, ADA.name, consented = true), deviceJoins = false))

        showGate(accounts) {}

        compose.onNodeWithText("Lessons").assertIsDisplayed()
        compose.onNodeWithText(SERVICE_NOTICE).assertDoesNotExist()
        assertTrue(api.calls.isEmpty())
    }

    private fun inUse(learner: LearnerDto) =
        accountStore(Account(UID, null, ChosenLearner(learner.id, learner.name, consented = false), deviceJoins = false))

    private fun showGate(accounts: AccountStore, onSwitch: () -> Unit) {
        val model = ServiceConsentViewModel(application, ServiceConsents(api, accounts), parent)
        compose.setContent {
            GraspyTheme(InterfaceLanguage.ENGLISH) {
                val account by accounts.account.collectAsState()
                account?.learner?.let { ServiceConsentGate(copy, it, model, onSwitch) { Text("Lessons") } }
            }
        }
    }

    private companion object {
        const val WAIT_MS = 5_000L
    }
}

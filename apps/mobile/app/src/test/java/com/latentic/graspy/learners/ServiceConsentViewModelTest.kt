package com.latentic.graspy.learners

import android.app.Application
import com.google.firebase.auth.FirebaseAuthException
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.Account
import com.latentic.graspy.account.AccountStore
import com.latentic.graspy.account.CARA
import com.latentic.graspy.account.ChosenLearner
import com.latentic.graspy.account.FakeAccountApi
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.account.ServiceConsents
import com.latentic.graspy.account.UID
import com.latentic.graspy.account.accountStore
import com.latentic.graspy.account.hostActivity
import com.latentic.graspy.auth.Confirmation
import com.latentic.graspy.auth.FakeConfirmation
import com.latentic.graspy.consent.ConsentProblem
import com.latentic.graspy.settleMain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** The learner this device already learned as opens once their parent has agreed, and not before. */
@RunWith(RobolectricTestRunner::class)
class ServiceConsentViewModelTest {
    private val application: Application = RuntimeEnvironment.getApplication()
    private val activity = hostActivity()
    private val api = FakeAccountApi(listOf(ADA, CARA))
    private val parent = FakeConfirmation()

    private fun accounts(learner: LearnerDto) =
        accountStore(Account(UID, "parent@example.com", ChosenLearner(learner.id, learner.name, consented = false), deviceJoins = false))

    private fun viewModel(learner: LearnerDto) =
        accounts(learner).let { it to ServiceConsentViewModel(application, ServiceConsents(api, it), parent) }

    private fun consented(accounts: AccountStore) = requireNotNull(accounts.account.value?.learner).consented

    @Test
    fun `a learner graspy holds no agreement for is asked about, and does not open`() {
        val (accounts, model) = viewModel(CARA)

        model.check()
        settleMain { !model.state.value.checking }

        assertFalse(model.state.value.checkFailed)
        assertFalse(consented(accounts))
        assertTrue(parent.shownOver.isEmpty())
    }

    @Test
    fun `a learner graspy holds an agreement for opens without the parent`() {
        val (accounts, model) = viewModel(ADA)

        model.check()
        settleMain { consented(accounts) }

        assertTrue(parent.shownOver.isEmpty())
    }

    @Test
    fun `graspy not reached to ask says so, keeps the learner closed, and asking again works`() {
        api.listingFails = true
        val (accounts, model) = viewModel(ADA)

        model.check()
        settleMain { model.state.value.checkFailed }

        assertFalse(consented(accounts))
        api.listingFails = false
        model.check()
        settleMain { consented(accounts) }
        assertFalse(model.state.value.checkFailed)
    }

    @Test
    fun `a parent who signs in again and agrees has it recorded with the fresh token, and the learner opens`() {
        val (accounts, model) = viewModel(CARA)

        model.agree(activity)
        settleMain { consented(accounts) }

        assertEquals(listOf(activity), parent.shownOver)
        assertEquals(listOf("agree:${CARA.id}:1:${FakeConfirmation.TOKEN}"), api.calls)
        assertNull(model.state.value.problem)
    }

    @Test
    fun `a parent who closes Google's sheet leaves the learner unusable, with nothing recorded and nothing said`() {
        parent.next = Confirmation.Cancelled
        val (accounts, model) = viewModel(CARA)

        model.agree(activity)
        settleMain { !model.state.value.busy && parent.shownOver.isNotEmpty() }

        assertFalse(consented(accounts))
        assertTrue(api.calls.isEmpty())
        assertNull(model.state.value.problem)
    }

    @Test
    fun `a stale sign-in, or a notice graspy does not know, is a retry that signs in again`() {
        val (accounts, model) = viewModel(CARA)
        for (refusal in listOf(401 to "sign_in_stale", 400 to "notice_unknown")) {
            api.consentRefusedWith = refusal.first to """{"detail":{"error":"refused","code":"${refusal.second}"}}"""

            model.agree(activity)
            settleMain { model.state.value.problem != null }

            assertEquals(refusal.second, ConsentProblem.SIGN_IN, model.state.value.problem)
            assertFalse(consented(accounts))
        }
        api.consentRefusedWith = null

        model.agree(activity)
        settleMain { consented(accounts) }

        assertEquals(3, parent.shownOver.size)
    }

    @Test
    fun `Firebase failing inside the sign-in is a retry, and nothing is left busy`() {
        parent.throwing = FirebaseAuthException("ERROR_INTERNAL_ERROR", "An internal error has occurred")
        val (accounts, model) = viewModel(CARA)

        model.agree(activity)
        settleMain { model.state.value.problem != null }

        assertEquals(ConsentProblem.SIGN_IN, model.state.value.problem)
        assertFalse(model.state.value.busy)
        assertFalse(consented(accounts))
        parent.throwing = null
        model.agree(activity)
        settleMain { consented(accounts) }
    }

    @Test
    fun `a Google account that is not the account's is told as such`() {
        parent.next = Confirmation.OtherAccount
        val (accounts, model) = viewModel(CARA)

        model.agree(activity)
        settleMain { model.state.value.problem != null }

        assertEquals(ConsentProblem.OTHER_ACCOUNT, model.state.value.problem)
        assertFalse(consented(accounts))
    }
}

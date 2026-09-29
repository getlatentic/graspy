package com.latentic.graspy.learners

import android.app.Application
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.AGREED
import com.latentic.graspy.account.BAYO
import com.latentic.graspy.account.CARA
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.account.LearnerPicks
import com.latentic.graspy.account.UnsentChanges
import com.latentic.graspy.account.hostActivity
import com.latentic.graspy.account.httpError
import com.latentic.graspy.auth.Confirmation
import com.latentic.graspy.auth.FakeConfirmation
import com.latentic.graspy.auth.FreshSignIn
import com.google.firebase.auth.FirebaseAuthException
import com.latentic.graspy.settleMain
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** "Who's learning?" adds a new learner once, and only with a parent who has agreed, whether or not the switch to them goes through. */
@RunWith(RobolectricTestRunner::class)
class LearnerPickerViewModelTest {
    private val application: Application = RuntimeEnvironment.getApplication()
    private val activity = hostActivity()
    private val picks = FakePicks()
    private val parent = FakeConfirmation()
    private var leaves = 0
    /** How each leave for another account ends; it leaves unless told otherwise. */
    private var leaving: suspend () -> Unit = {}
    private val picker = LearnerPickerViewModel(application, picks, parent) { leaves += 1; leaving() }
    private var chosen = 0

    @Test
    fun `a learner added, whose switch stops at what is unsent, closes the form and is never added again`() {
        picks.unsent = true
        picker.startAdding()

        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { picker.state.value.problem != null }

        assertEquals(ChoiceProblem.UNSENT, picker.state.value.problem)
        assertFalse(picker.state.value.adding)
        picker.anyway { chosen += 1 }
        settleMain { chosen == 1 }
        assertEquals(listOf("Bayo" to FakeConfirmation.TOKEN), picks.added)
        assertEquals(listOf(BAYO to false, BAYO to true), picks.chosen)
    }

    @Test
    fun `a learner added and switched to closes the form`() {
        picker.startAdding()

        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { chosen == 1 }

        assertFalse(picker.state.value.adding)
        assertEquals(listOf("Bayo" to FakeConfirmation.TOKEN), picks.added)
    }

    @Test
    fun `a learner added shows among the tiles while the switch sends what is unsent`() {
        val switched = CompletableDeferred<Unit>()
        picks.switching = { switched.await() }
        picker.startAdding()

        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { picker.state.value.learners != null }

        assertFalse(picker.state.value.adding)
        assertTrue(picker.state.value.busy)
        assertEquals(listOf(BAYO), picker.state.value.learners)
        switched.complete(Unit)
        settleMain { chosen == 1 }
    }

    @Test
    fun `leaving for another account that fails says so, and can be tried again`() {
        leaving = { throw IOException("the wipe could not finish") }

        picker.leaveForAnotherAccount()
        settleMain { picker.state.value.problem != null }

        assertEquals(ChoiceProblem.FAILED, picker.state.value.problem)
        assertFalse(picker.state.value.busy)
        leaving = {}
        picker.leaveForAnotherAccount()
        settleMain { leaves == 2 }
    }

    @Test
    fun `a second tap while leaving for another account, or while a learner opens, leaves nothing twice`() {
        val left = CompletableDeferred<Unit>()
        leaving = { left.await() }

        picker.leaveForAnotherAccount()
        picker.leaveForAnotherAccount()
        picker.choose(ADA) { chosen += 1 }
        settleMain { leaves == 1 }

        assertTrue(picker.state.value.leaving)
        left.complete(Unit)
        settleMain { !picker.state.value.busy }
        assertEquals(1, leaves)
        assertFalse(picker.state.value.leaving)
        assertTrue(picks.chosen.isEmpty())
    }

    @Test
    fun `an add graspy did not make keeps the form open to try again`() {
        picks.addFails = true
        picker.startAdding()

        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { picker.state.value.problem != null }

        assertEquals(ChoiceProblem.FAILED, picker.state.value.problem)
        assertTrue(picker.state.value.adding)
        assertTrue(picks.chosen.isEmpty())
    }

    @Test
    fun `a learner already agreed for is chosen without an add or a new sign-in`() {
        picker.choose(ADA) { chosen += 1 }
        settleMain { chosen == 1 }

        assertTrue(picks.added.isEmpty())
        assertEquals(listOf(ADA to false), picks.chosen)
        assertTrue(parent.shownOver.isEmpty())
    }

    @Test
    fun `adding a learner needs the parent to sign in with Google again, over the activity that asked`() {
        picker.startAdding()

        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { chosen == 1 }

        assertEquals(listOf(activity), parent.shownOver)
        assertEquals(listOf("Bayo" to FakeConfirmation.TOKEN), picks.added)
    }

    @Test
    fun `a parent who closes Google's sheet adds no learner and sees no problem`() {
        parent.next = Confirmation.Cancelled
        picker.startAdding()

        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { !picker.state.value.busy }

        assertTrue(picks.added.isEmpty())
        assertNull(picker.state.value.problem)
        assertTrue(picker.state.value.adding)
        assertEquals(0, chosen)
    }

    @Test
    fun `a sign-in that fails, or a Google account that is not the account's, adds no learner and can be tried again`() {
        picker.startAdding()
        parent.next = Confirmation.Failed("Google could not be reached")

        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { picker.state.value.problem != null }
        assertEquals(ChoiceProblem.SIGN_IN, picker.state.value.problem)

        parent.next = Confirmation.OtherAccount
        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { picker.state.value.problem == ChoiceProblem.OTHER_ACCOUNT }

        assertTrue(picks.added.isEmpty())
        assertTrue(picker.state.value.adding)
        parent.next = FakeConfirmation.confirmed()
        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { chosen == 1 }
        assertEquals(listOf("Bayo" to FakeConfirmation.TOKEN), picks.added)
    }

    @Test
    fun `a sign-in the server calls stale, or a notice it does not know, is a retry and adds no learner`() {
        picker.startAdding()
        val refusals = listOf(
            Triple(401, "sign_in_stale", ChoiceProblem.SIGN_IN),
            Triple(401, "sign_in_invalid", ChoiceProblem.SIGN_IN),
            Triple(400, "notice_unknown", ChoiceProblem.SIGN_IN),
            Triple(503, "consent_unavailable", ChoiceProblem.FAILED),
        )
        for ((status, code, told) in refusals) {
            picks.refusedWith = httpError(status, """{"detail":{"error":"refused","code":"$code"}}""")

            picker.addAndChoose("Bayo", activity) { chosen += 1 }
            settleMain { picker.state.value.problem != null }

            assertEquals(code, told, picker.state.value.problem)
            assertTrue(code, picker.state.value.adding)
            assertFalse(code, picker.state.value.busy)
        }
        assertEquals(0, chosen)
        picks.refusedWith = null
        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { chosen == 1 }
        assertEquals(5, parent.shownOver.size)
    }

    @Test
    fun `a sign-in the server says is another account's is told as such`() {
        picks.refusedWith = httpError(403, """{"detail":{"error":"That sign-in is not this account's","code":"sign_in_other_account"}}""")
        picker.startAdding()

        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { picker.state.value.problem != null }

        assertEquals(ChoiceProblem.OTHER_ACCOUNT, picker.state.value.problem)
    }

    @Test
    fun `a learner whose parent has not agreed is not chosen - the parent is asked first`() {
        picker.choose(CARA) { chosen += 1 }

        assertEquals(CARA, picker.state.value.consenting)
        assertTrue(picks.chosen.isEmpty())
        assertTrue(parent.shownOver.isEmpty())
        assertEquals(0, chosen)
    }

    @Test
    fun `a parent who declines leaves the learner unchosen`() {
        picker.choose(CARA) { chosen += 1 }

        picker.declineConsent()

        assertNull(picker.state.value.consenting)
        assertTrue(picks.chosen.isEmpty())
        assertTrue(picks.agreed.isEmpty())
        assertEquals(0, chosen)
    }

    @Test
    fun `a parent who closes Google's sheet leaves the learner unchosen, still asked`() {
        parent.next = Confirmation.Cancelled
        picker.choose(CARA) { chosen += 1 }

        picker.agreeAndChoose(CARA, activity) { chosen += 1 }
        settleMain { !picker.state.value.busy }

        assertEquals(CARA, picker.state.value.consenting)
        assertTrue(picks.agreed.isEmpty())
        assertTrue(picks.chosen.isEmpty())
    }

    @Test
    fun `a parent who agrees with a fresh sign-in has it recorded and the learner is chosen as agreed for`() {
        picker.choose(CARA) { chosen += 1 }

        picker.agreeAndChoose(CARA, activity) { chosen += 1 }
        settleMain { chosen == 1 }

        assertEquals(listOf(CARA to FakeConfirmation.TOKEN), picks.agreed)
        assertEquals(listOf(CARA.copy(serviceConsent = AGREED) to false), picks.chosen)
        assertNull(picker.state.value.consenting)
    }

    @Test
    fun `an agreement the server refuses as stale leaves the learner unchosen, and asking again signs in again`() {
        picks.refusedWith = httpError(401, """{"detail":{"error":"Sign in again to agree","code":"sign_in_stale"}}""")
        picker.choose(CARA) { chosen += 1 }

        picker.agreeAndChoose(CARA, activity) { chosen += 1 }
        settleMain { picker.state.value.problem != null }

        assertEquals(ChoiceProblem.SIGN_IN, picker.state.value.problem)
        assertEquals(CARA, picker.state.value.consenting)
        assertTrue(picks.chosen.isEmpty())
        picks.refusedWith = null
        picker.agreeAndChoose(CARA, activity) { chosen += 1 }
        settleMain { chosen == 1 }
        assertEquals(2, parent.shownOver.size)
    }

    @Test
    fun `Firebase failing inside the sign-in is a retry, and nothing is left busy`() {
        parent.throwing = FirebaseAuthException("ERROR_INTERNAL_ERROR", "An internal error has occurred")
        picker.startAdding()

        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { picker.state.value.problem != null }

        assertEquals(ChoiceProblem.SIGN_IN, picker.state.value.problem)
        assertFalse(picker.state.value.busy)
        assertTrue(picker.state.value.adding)
        assertTrue(picks.added.isEmpty())
        parent.throwing = null
        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { chosen == 1 }
    }

    @Test
    fun `an add whose answer was lost is found when tried again, not added twice, and agreed for if it had no agreement`() {
        picks.addLosesReply = true
        picks.lostLearnerAgreed = false
        picker.startAdding()
        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { picker.state.value.problem != null }
        assertTrue(picker.state.value.adding)

        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { chosen == 1 }

        assertEquals(listOf("Bayo"), picks.addCalls)
        assertEquals(listOf("Bayo"), picks.agreed.map { it.first.name })
        assertEquals(listOf("Bayo"), picks.chosen.map { it.first.name })
    }

    @Test
    fun `an add whose answer was lost, and that had the agreement, is chosen without another`() {
        picks.addLosesReply = true
        picker.startAdding()
        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { picker.state.value.problem != null }

        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { chosen == 1 }

        assertEquals(listOf("Bayo"), picks.addCalls)
        assertTrue(picks.agreed.isEmpty())
    }

    @Test
    fun `an add graspy refused added no one, so trying again adds`() {
        picks.refusedWith = httpError(400, """{"detail":{"error":"refused","code":"notice_unknown"}}""")
        picker.startAdding()
        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { picker.state.value.problem != null }
        picks.refusedWith = null

        picker.addAndChoose("Bayo", activity) { chosen += 1 }
        settleMain { chosen == 1 }

        assertEquals(listOf("Bayo", "Bayo"), picks.addCalls)
    }

    private class FakePicks : LearnerPicks {
        var unsent = false
        var addFails = false
        /** The add is made, and its answer never reaches the phone. */
        var addLosesReply = false
        var lostLearnerAgreed = true
        val addCalls = mutableListOf<String>()
        private val made = mutableListOf<LearnerDto>()
        /** The refusal graspy answers an add or an agreement with, if it does. */
        var refusedWith: Throwable? = null
        /** What the switch waits on, as unsent work being sent. */
        var switching: suspend () -> Unit = {}
        val added = mutableListOf<Pair<String, String>>()
        val agreed = mutableListOf<Pair<LearnerDto, String>>()
        val chosen = mutableListOf<Pair<LearnerDto, Boolean>>()

        override suspend fun add(name: String, consent: FreshSignIn): LearnerDto {
            addCalls += name
            if (addFails) throw IOException("graspy could not be reached")
            refusedWith?.let { throw it }
            if (addLosesReply) {
                made += BAYO.copy(name = name, serviceConsent = AGREED.takeIf { lostLearnerAgreed })
                throw IOException("the answer never came")
            }
            added += name to consent.idToken
            return BAYO
        }

        override suspend fun addedAlready(name: String): LearnerDto? = made.firstOrNull { it.name == name }

        override suspend fun agree(learner: LearnerDto, consent: FreshSignIn): LearnerDto {
            refusedWith?.let { throw it }
            agreed += learner to consent.idToken
            return learner.copy(serviceConsent = AGREED)
        }

        override suspend fun choose(learner: LearnerDto, loseUnsent: Boolean) {
            check(learner.serviceConsent != null) { "A learner whose parent has not agreed was chosen" }
            chosen += learner to loseUnsent
            switching()
            if (unsent && !loseUnsent) throw UnsentChanges(offline = false)
        }
    }
}

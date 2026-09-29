package com.latentic.graspy.account

import com.latentic.graspy.auth.FreshSignIn
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Answers kept on the phone are sent for a learner only once their parent has agreed: at start if so, and at once when they do. */
@RunWith(RobolectricTestRunner::class)
class AgreedLearnerTest {
    private val recovered = mutableListOf<String>()

    private fun inUse(learner: LearnerDto, consented: Boolean) =
        accountStore(Account(UID, null, ChosenLearner(learner.id, learner.name, consented), deviceJoins = false))

    private suspend fun settle(job: Job) {
        repeat(20) { yield() }
        job.cancel()
    }

    @Test
    fun `the learner in use is not one for the background until their parent has agreed`() {
        assertNull(inUse(ADA, consented = false).account.value?.agreedLearnerKey)
        assertEquals(learnerKey(UID, ADA.id), inUse(ADA, consented = true).account.value?.agreedLearnerKey)
        assertEquals(learnerKey(UID, ADA.id), inUse(ADA, consented = false).account.value?.learnerKey)
    }

    @Test
    fun `at start, a learner whose parent has not agreed starts nothing`() = runBlocking {
        val accounts = inUse(ADA, consented = false)

        val watching = launch { accounts.whenLearnerAgreed { recovered += it } }
        settle(watching)

        assertEquals(emptyList<String>(), recovered)
    }

    @Test
    fun `at start, a learner whose parent has agreed has what waited sent`() = runBlocking {
        val accounts = inUse(ADA, consented = true)

        val watching = launch { accounts.whenLearnerAgreed { recovered += it } }
        settle(watching)

        assertEquals(listOf(learnerKey(UID, ADA.id)), recovered)
    }

    @Test
    fun `once the parent agrees, what waited is sent, and only then`() = runBlocking {
        val accounts = inUse(CARA, consented = false)
        val watching = launch { accounts.whenLearnerAgreed { recovered += it } }
        repeat(20) { yield() }
        assertEquals(emptyList<String>(), recovered)

        ServiceConsents(FakeAccountApi(listOf(CARA)), accounts).agree(FreshSignIn("fresh-id-token"))
        settle(watching)

        assertEquals(listOf(learnerKey(UID, CARA.id)), recovered)
    }

    @Test
    fun `nothing is sent again for the same learner when their name changes`() = runBlocking {
        val accounts = inUse(ADA, consented = true)
        val watching = launch { accounts.whenLearnerAgreed { recovered += it } }
        repeat(20) { yield() }

        accounts.changeLearner(ADA.id) { it.copy(name = "Ada L") }
        settle(watching)

        assertEquals(1, recovered.size)
    }
}

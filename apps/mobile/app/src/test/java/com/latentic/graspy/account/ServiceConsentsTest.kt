package com.latentic.graspy.account

import com.latentic.graspy.auth.FreshSignIn
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A learner this device was already learning as, before consent was asked, opens only once graspy holds their parent's. */
@RunWith(RobolectricTestRunner::class)
class ServiceConsentsTest {
    private val api = FakeAccountApi(listOf(ADA, CARA))

    private fun inUse(learner: LearnerDto) =
        accountStore(Account(UID, "parent@example.com", ChosenLearner(learner.id, learner.name, consented = false), deviceJoins = false))

    @Test
    fun `a learner graspy holds no agreement for is not agreed for, and the device does not say they are`() = runBlocking {
        val accounts = inUse(CARA)

        assertFalse(ServiceConsents(api, accounts).check())

        assertFalse(requireNotNull(accounts.account.value?.learner).consented)
    }

    @Test
    fun `a learner graspy holds an agreement for is agreed for, and the device keeps it for opening without a connection`() = runBlocking {
        val accounts = inUse(ADA)

        assertTrue(ServiceConsents(api, accounts).check())

        assertTrue(requireNotNull(accounts.account.value?.learner).consented)
        assertTrue(AccountStore(context().getSharedPreferences(PreferenceFiles.ACCOUNT, 0)).account.value?.learner?.consented == true)
    }

    @Test
    fun `a learner the account no longer lists is left by their next session, not asked about here`() = runBlocking {
        val accounts = inUse(BAYO)

        assertTrue(ServiceConsents(api, accounts).check())
    }

    @Test
    fun `graspy not reached to ask is no answer, so the learner stays closed`() {
        val accounts = inUse(ADA)
        api.listingFails = true

        assertThrows(java.io.IOException::class.java) { runBlocking { ServiceConsents(api, accounts).check() } }

        assertFalse(requireNotNull(accounts.account.value?.learner).consented)
    }

    @Test
    fun `agreeing puts the fresh sign-in for the learner in use, and the learner is then agreed for`() = runBlocking {
        val accounts = inUse(CARA)

        ServiceConsents(api, accounts).agree(FreshSignIn("fresh-id-token"))

        assertEquals(listOf("agree:${CARA.id}:1:fresh-id-token"), api.calls)
        assertTrue(requireNotNull(accounts.account.value?.learner).consented)
    }

    @Test
    fun `an agreement graspy refuses leaves the learner not agreed for`() {
        val accounts = inUse(CARA)
        api.consentRefusedWith = 401 to """{"detail":{"error":"Sign in again","code":"sign_in_stale"}}"""

        assertThrows(retrofit2.HttpException::class.java) { runBlocking { ServiceConsents(api, accounts).agree(FreshSignIn("stale")) } }

        assertFalse(requireNotNull(accounts.account.value?.learner).consented)
    }

    @Test
    fun `an agreement recorded after the device left the learner does not mark whoever is in use now`() = runBlocking {
        val accounts = inUse(CARA)
        api.whileAgreeing = { accounts.setLearner(ChosenLearner(ADA.id, ADA.name, consented = false)) }

        ServiceConsents(api, accounts).agree(FreshSignIn("fresh-id-token"))

        assertFalse(requireNotNull(accounts.account.value?.learner).consented)
    }
}

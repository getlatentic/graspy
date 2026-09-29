package com.latentic.graspy.account

import com.latentic.graspy.localization.LearnerProfileStore
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LearnerDirectoryTest {
    private val api = FakeAccountApi()

    private fun directory(accounts: AccountStore) = LearnerDirectory(api, accounts, LearnerProfileStore(context()), leaveLearner = {}, signOut = {})

    @Test
    fun `renaming the learner in use keeps that their parent has agreed, though graspy's answer says nothing of it`() = runBlocking {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))

        val renamed = directory(accounts).rename(ADA.id, "Ada L")

        assertEquals(null, renamed.serviceConsent)
        assertEquals(chosen(ADA).copy(name = "Ada L"), accounts.account.value?.learner)
    }

    @Test
    fun `renaming another learner leaves the one in use as they were`() = runBlocking {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))

        directory(accounts).rename(BAYO.id, "Bayo B")

        assertEquals(chosen(ADA), accounts.account.value?.learner)
    }
}

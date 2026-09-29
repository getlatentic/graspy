package com.latentic.graspy.account

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Leaving a learner, by switching or signing out, asks before wiping answers that were not sent. */
class LeavingLearnerTest {
    private val flushed = mutableListOf<String>()
    private var everythingSent = true

    private fun account(consented: Boolean) =
        Account(UID, null, ChosenLearner(ADA.id, ADA.name, consented), deviceJoins = false)

    private fun losesAnswers(account: Account, queued: Boolean) = runBlocking {
        leavingLosesAnswers(account, { key -> flushed += key; everythingSent }, { queued })
    }

    @Test
    fun `a learner agreed for has their answers sent first, and loses them only if they cannot be`() {
        assertFalse(losesAnswers(account(consented = true), queued = true))
        everythingSent = false
        assertTrue(losesAnswers(account(consented = true), queued = true))
        assertEquals(listOf(learnerKey(UID, ADA.id), learnerKey(UID, ADA.id)), flushed)
    }

    @Test
    fun `a learner not agreed for, with answers queued, asks first, and nothing is sent`() {
        assertTrue(losesAnswers(account(consented = false), queued = true))
        assertEquals(emptyList<String>(), flushed)
    }

    @Test
    fun `a learner not agreed for, with nothing queued, loses nothing`() {
        assertFalse(losesAnswers(account(consented = false), queued = false))
    }
}

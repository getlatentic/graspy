package com.latentic.graspy.account

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LearnerChoiceTest {
    private val api = FakeAccountApi()
    private val events = api.calls
    private var everythingSent = true

    private fun choice(accounts: AccountStore) = LearnerChoice(
        accounts = accounts,
        api = api,
        sessions = heldSessions(accounts),
        deviceId = { DEVICE },
        outbox = { learner -> events += "flush:$learner"; everythingSent },
        leaveLearner = {
            events += "wipe"
            accounts.setLearner(null)
        },
        claimDeviceLearning = { uid, learner -> events += "claim:$uid->$learner" },
    )

    @Test
    fun `the first choice after signing in names the device and takes the device's own learning`() = runBlocking {
        val accounts = accountStore(signedIn(learner = null))

        choice(accounts).choose(ADA)

        assertEquals(listOf("session:${ADA.id}:$DEVICE", "claim:$UID->${learnerKey(UID, ADA.id)}"), events)
        assertEquals(ChosenLearner(ADA.id, ADA.name), accounts.account.value?.learner)
        assertFalse(requireNotNull(accounts.account.value).deviceJoins)
    }

    @Test
    fun `a later choice sends what is unsent, wipes the device, then takes up the learner`() = runBlocking {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))

        choice(accounts).choose(BAYO)

        assertEquals(listOf("flush:${learnerKey(UID, ADA.id)}", "wipe", "session:${BAYO.id}:null"), events)
        assertEquals(ChosenLearner(BAYO.id, BAYO.name), accounts.account.value?.learner)
    }

    @Test
    fun `a switch that cannot send everything is refused, and nothing is wiped`() {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))
        everythingSent = false

        assertThrows(UnsentChanges::class.java) { runBlocking { choice(accounts).choose(BAYO) } }
        assertEquals(listOf("flush:${learnerKey(UID, ADA.id)}"), events)
        assertEquals(ChosenLearner(ADA.id, ADA.name), accounts.account.value?.learner)
    }

    @Test
    fun `choosing the learner already in use changes nothing`() = runBlocking {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))

        choice(accounts).choose(ADA)

        assertEquals(emptyList<String>(), events)
    }

    @Test
    fun `after the learner in use was removed, the next choice has nothing of theirs to send`() = runBlocking {
        val accounts = accountStore(signedIn(learner = null, deviceJoins = false))

        choice(accounts).choose(BAYO)

        assertEquals(listOf("wipe", "session:${BAYO.id}:null"), events)
    }

    @Test
    fun `adding a learner confirms the guardian, then chooses them`() = runBlocking {
        val accounts = accountStore(signedIn(learner = null))

        choice(accounts).addAndChoose("Tolu")

        assertEquals("add:Tolu:true", events.first())
        assertEquals("Tolu", accounts.account.value?.learner?.name)
    }
}

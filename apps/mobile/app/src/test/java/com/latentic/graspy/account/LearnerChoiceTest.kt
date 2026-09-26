package com.latentic.graspy.account

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.HttpException

@RunWith(RobolectricTestRunner::class)
class LearnerChoiceTest {
    private val api = FakeAccountApi()
    private val events = api.calls
    private var everythingSent = true
    private var online = true

    private fun choice(accounts: AccountStore) = LearnerChoice(
        accounts = accounts,
        api = api,
        sessions = heldSessions(accounts),
        deviceId = { DEVICE },
        outbox = { learner -> events += "flush:$learner"; everythingSent },
        online = { online },
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
    fun `a later choice sends what is unsent, has the learner's session issued, then wipes the device and takes them up`() = runBlocking {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))

        choice(accounts).choose(BAYO)

        assertEquals(listOf("flush:${learnerKey(UID, ADA.id)}", "session:${BAYO.id}:null", "wipe"), events)
        assertEquals(ChosenLearner(BAYO.id, BAYO.name), accounts.account.value?.learner)
    }

    @Test
    fun `offline, a switch that cannot send everything is refused, and nothing is wiped`() {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))
        everythingSent = false
        online = false

        val refused = assertThrows(UnsentChanges::class.java) { runBlocking { choice(accounts).choose(BAYO) } }

        assertTrue(refused.offline)
        assertEquals(listOf("flush:${learnerKey(UID, ADA.id)}"), events)
        assertEquals(ChosenLearner(ADA.id, ADA.name), accounts.account.value?.learner)
    }

    @Test
    fun `online, a switch that could not send everything asks first, and nothing is wiped`() {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))
        everythingSent = false

        val refused = assertThrows(UnsentChanges::class.java) { runBlocking { choice(accounts).choose(BAYO) } }

        assertFalse(refused.offline)
        assertEquals(listOf("flush:${learnerKey(UID, ADA.id)}"), events)
        assertEquals(ChosenLearner(ADA.id, ADA.name), accounts.account.value?.learner)
    }

    @Test
    fun `switching anyway goes ahead with what could not be sent`() = runBlocking {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))
        everythingSent = false

        choice(accounts).choose(BAYO, loseUnsent = true)

        assertEquals(listOf("session:${BAYO.id}:null", "wipe"), events)
        assertEquals(ChosenLearner(BAYO.id, BAYO.name), accounts.account.value?.learner)
    }

    @Test
    fun `a switch graspy does not issue a session for leaves the device as it was`() {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))
        api.sessionRefusedWith = 503

        assertThrows(HttpException::class.java) { runBlocking { choice(accounts).choose(BAYO, loseUnsent = true) } }

        assertEquals(listOf("session:${BAYO.id}:null"), events)
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

        assertEquals(listOf("session:${BAYO.id}:null", "wipe"), events)
    }

    @Test
    fun `adding a learner confirms the guardian`() = runBlocking {
        val added = choice(accountStore(signedIn(learner = null))).add("Tolu")

        assertEquals(listOf("add:Tolu:true"), events)
        assertEquals("Tolu", added.name)
    }
}

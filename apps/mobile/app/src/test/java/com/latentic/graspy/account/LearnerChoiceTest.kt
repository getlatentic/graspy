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
import retrofit2.HttpException

@RunWith(RobolectricTestRunner::class)
class LearnerChoiceTest {
    private val api = FakeAccountApi(listOf(ADA, BAYO, CARA))
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
        assertEquals(chosen(ADA), accounts.account.value?.learner)
        assertFalse(requireNotNull(accounts.account.value).deviceJoins)
    }

    @Test
    fun `a later choice sends what is unsent, has the learner's session issued, then wipes the device and takes them up`() = runBlocking {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))

        choice(accounts).choose(BAYO)

        assertEquals(listOf("flush:${learnerKey(UID, ADA.id)}", "session:${BAYO.id}:null", "wipe"), events)
        assertEquals(chosen(BAYO), accounts.account.value?.learner)
    }

    @Test
    fun `offline, a switch that cannot send everything is refused, and nothing is wiped`() {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))
        everythingSent = false
        online = false

        val refused = assertThrows(UnsentChanges::class.java) { runBlocking { choice(accounts).choose(BAYO) } }

        assertTrue(refused.offline)
        assertEquals(listOf("flush:${learnerKey(UID, ADA.id)}"), events)
        assertEquals(chosen(ADA), accounts.account.value?.learner)
    }

    @Test
    fun `online, a switch that could not send everything asks first, and nothing is wiped`() {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))
        everythingSent = false

        val refused = assertThrows(UnsentChanges::class.java) { runBlocking { choice(accounts).choose(BAYO) } }

        assertFalse(refused.offline)
        assertEquals(listOf("flush:${learnerKey(UID, ADA.id)}"), events)
        assertEquals(chosen(ADA), accounts.account.value?.learner)
    }

    @Test
    fun `switching anyway goes ahead with what could not be sent`() = runBlocking {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))
        everythingSent = false

        choice(accounts).choose(BAYO, loseUnsent = true)

        assertEquals(listOf("session:${BAYO.id}:null", "wipe"), events)
        assertEquals(chosen(BAYO), accounts.account.value?.learner)
    }

    @Test
    fun `a switch graspy does not issue a session for leaves the device as it was`() {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))
        api.sessionRefusedWith = 503

        assertThrows(HttpException::class.java) { runBlocking { choice(accounts).choose(BAYO, loseUnsent = true) } }

        assertEquals(listOf("session:${BAYO.id}:null"), events)
        assertEquals(chosen(ADA), accounts.account.value?.learner)
    }

    @Test
    fun `leaving a learner whose parent has not agreed sends nothing of theirs, and wipes them`() = runBlocking {
        val accounts = accountStore(Account(UID, "parent@example.com", ChosenLearner(CARA.id, CARA.name, consented = false), deviceJoins = false))

        choice(accounts).choose(ADA)

        assertEquals(listOf("session:${ADA.id}:null", "wipe"), events)
        assertEquals(chosen(ADA), accounts.account.value?.learner)
    }

    @Test
    fun `a learner graspy added moments ago under that name is found, and none of another name or of long ago`() = runBlocking {
        api.add(NewLearnerDto("Tolu", guardian = true))
        val accounts = accountStore(signedIn(learner = null))
        fun choiceAt(now: Long) = LearnerChoice(
            accounts = accounts,
            api = api,
            sessions = heldSessions(accounts),
            deviceId = { DEVICE },
            outbox = { true },
            online = { true },
            leaveLearner = {},
            claimDeviceLearning = { _, _ -> },
            now = { now },
        )

        assertEquals("Tolu", choiceAt(3L + 60_000).addedAlready("Tolu")?.name)
        assertEquals(null, choiceAt(3L + 60_000).addedAlready("Bayo B"))
        assertEquals(null, choiceAt(3L + 3 * 60 * 60_000).addedAlready("Tolu"))
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
    fun `adding a learner confirms the guardian and sends the parent's consent with the fresh sign-in`() = runBlocking {
        val added = choice(accountStore(signedIn(learner = null))).add("Tolu", FreshSignIn("fresh-id-token"))

        assertEquals(listOf("add:Tolu:true:consent:1:fresh-id-token"), events)
        assertEquals("Tolu", added.name)
        assertEquals(1, added.serviceConsent?.noticeVersion)
    }

    @Test
    fun `a learner whose parent has not agreed is refused, and the device stays as it was`() {
        val accounts = accountStore(signedIn(ADA, deviceJoins = false))

        assertThrows(IllegalStateException::class.java) { runBlocking { choice(accounts).choose(CARA) } }

        assertEquals(emptyList<String>(), events)
        assertEquals(chosen(ADA), accounts.account.value?.learner)
    }

    @Test
    fun `the first choice of a learner whose parent has not agreed takes nothing of the device's learning`() {
        val accounts = accountStore(signedIn(learner = null))

        assertThrows(IllegalStateException::class.java) { runBlocking { choice(accounts).choose(CARA) } }

        assertEquals(emptyList<String>(), events)
        assertTrue(requireNotNull(accounts.account.value).deviceJoins)
    }

    @Test
    fun `a parent's agreement for a learner already added is put with the fresh sign-in, and the learner is chosen as agreed for`() = runBlocking {
        val accounts = accountStore(signedIn(learner = null))
        val choice = choice(accounts)
        val agreedFor = choice.agree(CARA, FreshSignIn("fresh-id-token"))

        choice.choose(agreedFor)

        assertEquals(listOf("agree:${CARA.id}:1:fresh-id-token", "session:${CARA.id}:$DEVICE", "claim:$UID->${learnerKey(UID, CARA.id)}"), events)
        assertEquals(1, agreedFor.serviceConsent?.noticeVersion)
        assertEquals(ChosenLearner(CARA.id, CARA.name, consented = true), accounts.account.value?.learner)
    }

    @Test
    fun `agreeing for the learner in use, whose agreement the device had yet to see, records it without a switch`() = runBlocking {
        val unseen = ChosenLearner(ADA.id, ADA.name, consented = false)
        val accounts = accountStore(Account(UID, "parent@example.com", unseen, deviceJoins = false))

        choice(accounts).choose(ADA)

        assertEquals(emptyList<String>(), events)
        assertEquals(chosen(ADA), accounts.account.value?.learner)
    }
}

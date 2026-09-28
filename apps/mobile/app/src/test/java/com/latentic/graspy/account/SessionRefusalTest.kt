package com.latentic.graspy.account

import com.latentic.graspy.localization.LearnerProfileStore
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A session refused, from the exchange through the app's wiring into the sign-out it asks for. */
@RunWith(RobolectricTestRunner::class)
class SessionRefusalTest {
    private val context = context()
    private val database = inMemoryDatabase()
    private val accounts = accountStore(signedIn(ADA, deviceJoins = false))
    private val deviceIds = DeviceIdStore(context.getSharedPreferences(PreferenceFiles.DEVICE, 0))
    private val google = GoogleAccountForgets(accounts)
    private val firebase = FakeFirebase(google).apply { uid = UID }
    private var wipes = 0

    /** Each exchange's answer; graspy issues the learner's session unless told otherwise. */
    private var exchange: suspend (SessionRequestDto) -> IssuedSessionDto = { issued("session", ADA) }

    private lateinit var entry: AccountEntry
    private val sessions: SessionTokens = accountSessions(accounts, { DEVICE }, firebase, { exchange(it) }, { wipe }, { entry })
    private val wipe: DeviceWipe = DeviceWipe(context, database, accounts, sessions, deviceIds, LearnerProfileStore(context)) { wipes += 1 }

    init {
        entry = AccountEntry(context, { _, _ -> error("No sign-in is asked for") }, firebase, accounts, sessions, noSessionApi, deviceIds, wipe)
    }

    @After
    fun close() = database.close()

    @Test
    fun `a sign-in Google no longer holds signs its account out and wipes the device`() {
        firebase.uid = null

        assertThrows(SessionRefusal::class.java) { runBlocking { sessions.token() } }

        assertNull(accounts.account.value)
        assertEquals(1, wipes)
        assertEquals(listOf<Account?>(null), google.forgotten)
    }

    @Test
    fun `a refusal of an account that left while its exchange ran leaves the account signed in since alone`() {
        exchange = {
            // The account is signed out and another signed in while graspy answers.
            accounts.set(Account("uid-2", "other@example.com", learner = null, deviceJoins = true))
            firebase.uid = "uid-2"
            throw httpError(401)
        }

        assertThrows(SessionRefusal::class.java) { runBlocking { sessions.token() } }

        assertEquals("uid-2", accounts.account.value?.uid)
        assertEquals("uid-2", firebase.uid)
        assertEquals(0, wipes)
    }

    @Test
    fun `a learner graspy no longer knows is left, and the account stays`() = runBlocking {
        exchange = { issued("account-only", learner = null) }

        sessions.token()

        assertEquals(signedIn(learner = null, deviceJoins = false), accounts.account.value)
        assertEquals(1, wipes)
    }
}

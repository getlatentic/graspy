package com.latentic.graspy.account

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SessionTokensTest {
    private val accounts = accountStore(signedIn(ADA, deviceJoins = false))
    private val sent = mutableListOf<SessionRequestDto>()
    private val answers = ArrayDeque<(SessionRequestDto) -> IssuedSessionDto>()
    private val events = mutableListOf<String>()
    private var now = 1_000_000L
    private var googleHolds = true
    /** What happens on the device while Google is asked for the ID token. */
    private var whileAskingGoogle: () -> Unit = {}

    private val sessions = SessionTokens(
        accounts = accounts,
        deviceId = { DEVICE },
        idToken = { uid, fresh ->
            whileAskingGoogle()
            "$uid-${if (fresh) "fresh" else "cached"}".takeIf { googleHolds }
        },
        exchange = { request ->
            sent += request
            answers.removeFirstOrNull()?.invoke(request) ?: issued("token-${sent.size}", ADA)
        },
        learnerGone = {
            events += "learner gone"
            accounts.setLearner(null)
        },
        signedOutElsewhere = { uid -> events += "signed out $uid" },
        clock = { now },
    )

    @Test
    fun `an exchange names the device, the Google sign-in and the learner in use`() = runBlocking {
        assertEquals("token-1", sessions.token())

        assertEquals(listOf(SessionRequestDto(DEVICE, "$UID-cached", ADA.id)), sent)
    }

    @Test
    fun `the session is kept until five minutes before it expires`() = runBlocking {
        answers += { issued("first", ADA, expiresIn = 3_600) }
        sessions.token()
        now += 55 * 60 * 1_000L - 1

        assertEquals("first", sessions.token())
        now += 1

        assertEquals("token-2", sessions.token())
        assertEquals(2, sent.size)
    }

    @Test
    fun `a sign-in the server refuses is tried once more with a fresh ID token`() = runBlocking {
        answers += { throw httpError(401, """{"detail":{"code":"sign_in_invalid"}}""") }

        assertEquals("token-2", sessions.token())
        assertEquals(listOf("$UID-cached", "$UID-fresh"), sent.map { it.firebaseIdToken })
    }

    @Test
    fun `a session made for another learner is never used`() = runBlocking {
        sessions.token()
        accounts.setLearner(ChosenLearner(BAYO.id, BAYO.name))
        answers += { issued("bayo", BAYO) }

        assertEquals("bayo", sessions.token())
        assertEquals(listOf(ADA.id, BAYO.id), sent.map { it.learnerId })
    }

    @Test
    fun `a learner removed on another device leaves this one asking who is learning`() = runBlocking {
        answers += { issued("account-only", learner = null) }

        assertEquals("account-only", sessions.token())
        assertEquals(listOf("learner gone"), events)
        assertNull(accounts.account.value?.learner)
        assertEquals("account-only", sessions.token())
        assertEquals(1, sent.size)
    }

    @Test
    fun `a learner renamed on another device is known by the new name`() = runBlocking {
        answers += { issued("renamed", ADA.copy(name = "Ada Lovelace")) }

        sessions.token()

        assertEquals(ChosenLearner(ADA.id, "Ada Lovelace"), accounts.account.value?.learner)
        assertEquals(emptyList<String>(), events)
    }

    @Test
    fun `a learner gone for the account that left while its exchange ran leaves the account signed in since alone`() = runBlocking {
        answers += {
            // The account is signed out and another, learning as Bayo, signed in while graspy answers.
            accounts.set(Account("uid-2", "other@example.com", ChosenLearner(BAYO.id, BAYO.name), deviceJoins = false))
            issued("account-only", learner = null)
        }

        sessions.token()

        assertEquals(emptyList<String>(), events)
        assertEquals(ChosenLearner(BAYO.id, BAYO.name), accounts.account.value?.learner)
    }

    @Test
    fun `a learner renamed for the account that left while its exchange ran leaves the account signed in since alone`() = runBlocking {
        answers += {
            // Signed out and back in as another account whose learner has Ada's id, as a restored backup would.
            accounts.set(Account("uid-2", "other@example.com", ChosenLearner(ADA.id, "Ada"), deviceJoins = false))
            issued("renamed", ADA.copy(name = "Ada Lovelace"))
        }

        sessions.token()

        assertEquals(ChosenLearner(ADA.id, "Ada"), accounts.account.value?.learner)
    }

    @Test
    fun `a learner gone for the learner switched from while its exchange ran leaves the learner switched to alone`() = runBlocking {
        answers += {
            accounts.setLearner(ChosenLearner(BAYO.id, BAYO.name))
            issued("account-only", learner = null)
        }

        sessions.token()

        assertEquals(emptyList<String>(), events)
        assertEquals(ChosenLearner(BAYO.id, BAYO.name), accounts.account.value?.learner)
    }

    @Test
    fun `a sign-in Google no longer holds signs the device out`() {
        googleHolds = false

        assertThrows(SessionRefusal::class.java) { runBlocking { sessions.token() } }
        assertEquals(listOf("signed out $UID"), events)
        assertEquals(emptyList<SessionRequestDto>(), sent)
    }

    @Test
    fun `the account signed out is the one whose exchange was refused, though another signed in meanwhile`() {
        whileAskingGoogle = {
            googleHolds = false
            accounts.set(Account("uid-2", "other@example.com", learner = null, deviceJoins = true))
        }

        assertThrows(SessionRefusal::class.java) { runBlocking { sessions.token() } }
        assertEquals(listOf("signed out $UID"), events)
    }

    @Test
    fun `a refused session is replaced once, however many requests saw it refused`() = runBlocking {
        val refused = sessions.token()

        val renewed = sessions.renew(refused)

        assertEquals("token-2", renewed)
        assertEquals(renewed, sessions.renew(refused))
        assertEquals(2, sent.size)
    }
}

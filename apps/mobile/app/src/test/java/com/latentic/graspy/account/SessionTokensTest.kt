package com.latentic.graspy.account

import java.io.IOException
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

    private val sessions = SessionTokens(
        accounts = accounts,
        deviceId = { DEVICE },
        idToken = { uid, fresh -> "$uid-${if (fresh) "fresh" else "cached"}".takeIf { googleHolds } },
        exchange = { request ->
            sent += request
            answers.removeFirstOrNull()?.invoke(request) ?: issued("token-${sent.size}", ADA)
        },
        learnerGone = {
            events += "learner gone"
            accounts.setLearner(null)
        },
        signedOutElsewhere = { events += "signed out" },
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
    fun `a sign-in Google no longer holds signs the device out`() {
        googleHolds = false

        assertThrows(IOException::class.java) { runBlocking { sessions.token() } }
        assertEquals(listOf("signed out"), events)
        assertEquals(emptyList<SessionRequestDto>(), sent)
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

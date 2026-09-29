package com.latentic.graspy.account

import java.io.IOException
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SessionInterceptorTest {
    private val server = MockWebServer()
    private val accounts = accountStore(signedIn(ADA, deviceJoins = false))
    private var exchanges = 0
    private var refuseExchange = false
    private var googleUnreachable = false
    private var learnerHeld = true
    private var switchDuringExchange: LearnerDto? = null

    private val sessions = SessionTokens(
        accounts = accounts,
        deviceId = { DEVICE },
        idToken = { _, _ ->
            if (googleUnreachable) throw IOException("Google could not be reached to confirm the sign-in")
            "google-id-token"
        },
        exchange = {
            if (refuseExchange) throw httpError(503, """{"detail":{"code":"sign_in_off"}}""")
            exchanges += 1
            switchDuringExchange?.let { accounts.setLearner(chosen(it)) }
            issued("session-$exchanges", ADA.takeIf { learnerHeld })
        },
        learnerGone = { accounts.setLearner(null) },
        signedOutElsewhere = {},
    )

    private val client = OkHttpClient.Builder()
        .addInterceptor(SessionInterceptor(sessions) { accounts.account.value?.learnerKey })
        .build()

    @After
    fun close() = server.close()

    @Test
    fun `every request carries the graspy session`() {
        server.enqueue(MockResponse())

        call(request()).close()

        assertEquals("Bearer session-1", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun `a 401 is answered with a new session and the request is sent once more`() {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setBody("ok"))

        val response = call(request())

        assertEquals("ok", response.body.string())
        assertEquals("Bearer session-1", server.takeRequest().getHeader("Authorization"))
        assertEquals("Bearer session-2", server.takeRequest().getHeader("Authorization"))
        assertEquals(2, exchanges)
    }

    @Test
    fun `a 401 that refuses the sign-in a request carries is the answer, and asks for no new session`() {
        for (code in listOf("sign_in_stale", "sign_in_invalid")) {
            server.enqueue(MockResponse().setResponseCode(401).setBody("""{"detail":{"error":"Sign in again to agree","code":"$code"}}"""))

            val response = call(request())

            assertEquals(code, 401, response.code)
            assertEquals(code, 1, exchanges)
            assertEquals(code, "Bearer session-1", server.takeRequest().getHeader("Authorization"))
        }
        assertEquals(2, server.requestCount)
    }

    @Test
    fun `a 401 that refuses the session, by its code, is still answered with a new session`() {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"detail":{"error":"expired","code":"session_invalid"}}"""))
        server.enqueue(MockResponse().setBody("ok"))

        assertEquals("ok", call(request()).body.string())
        assertEquals(2, exchanges)
    }

    @Test
    fun `a second 401 is the answer, not a reason to ask again`() {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setResponseCode(401))

        assertEquals(401, call(request()).code)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun `a session naming no learner, for a learner removed elsewhere, leaves the device asking who is learning`() {
        server.enqueue(learnerRequired())
        runBlocking { sessions.token() }
        learnerHeld = false

        assertThrows(IOException::class.java) { call(request(learner = learnerKey(UID, ADA.id))) }

        assertEquals(null, accounts.account.value?.learner)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `a session naming no learner, for a learner still on the account, is renewed and the request sent again`() {
        server.enqueue(learnerRequired())
        server.enqueue(MockResponse().setBody("ok"))

        assertEquals("ok", call(request(learner = learnerKey(UID, ADA.id))).body.string())
        assertEquals(ADA.id, accounts.account.value?.learner?.id)
        assertEquals(2, exchanges)
    }

    @Test
    fun `other refusals are the caller's to read, with the session kept`() {
        server.enqueue(MockResponse().setResponseCode(409).setBody("""{"detail":"refused","code":"step_not_offered"}"""))

        val response = call(request())

        assertEquals(409, response.code)
        assertEquals("""{"detail":"refused","code":"step_not_offered"}""", response.body.string())
        assertEquals(1, exchanges)
    }

    @Test
    fun `a request for the learner in use is sent as them`() {
        server.enqueue(MockResponse())

        call(request(learner = learnerKey(UID, ADA.id))).close()

        assertEquals("Bearer session-1", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun `a request for a learner no longer in use is refused before it is sent, with no session fetched for it`() {
        assertThrows(SessionRefusal::class.java) { call(request(learner = learnerKey(UID, BAYO.id))) }
        assertEquals(0, server.requestCount)
        assertEquals(0, exchanges)
    }

    @Test
    fun `a request whose learner is switched while its session is fetched is refused, never sent as the next learner`() {
        switchDuringExchange = BAYO

        assertThrows(SessionRefusal::class.java) { call(request(learner = learnerKey(UID, ADA.id))) }
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `a session is not renewed for a learner switched away while the request was out`() {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                accounts.setLearner(chosen(BAYO))
                return MockResponse().setResponseCode(401)
            }
        }

        assertThrows(SessionRefusal::class.java) { call(request(learner = learnerKey(UID, ADA.id))) }
        assertEquals(1, exchanges)
    }

    @Test
    fun `an exchange refused over HTTP fails the call as OkHttp needs, and says it was refused`() {
        refuseExchange = true

        assertThrows(SessionRefusal::class.java) { call(request()) }
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `an exchange that cannot reach Google fails as a lost connection, never as a refusal`() {
        googleUnreachable = true

        val failure = assertThrows(IOException::class.java) { call(request()) }
        assertFalse(failure is SessionRefusal)
        assertEquals(0, server.requestCount)
    }

    private fun request(learner: String? = null): Request = Request.Builder()
        .url(server.url("/api/voice/lesson"))
        .apply { learner?.let { tag(RequestLearner::class.java, RequestLearner(it)) } }
        .build()

    private fun call(request: Request) = client.newCall(request).execute()

    private fun learnerRequired() = MockResponse()
        .setResponseCode(409)
        .setBody("""{"detail":{"error":"Choose a learner first","code":"learner_required"}}""")
}

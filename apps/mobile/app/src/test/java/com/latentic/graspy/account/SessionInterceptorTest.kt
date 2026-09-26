package com.latentic.graspy.account

import java.io.IOException
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
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

    private val sessions = SessionTokens(
        accounts = accounts,
        deviceId = { DEVICE },
        idToken = { _, _ -> "google-id-token" },
        exchange = {
            if (refuseExchange) throw httpError(503, """{"detail":{"code":"sign_in_off"}}""")
            exchanges += 1
            issued("session-$exchanges", ADA)
        },
        learnerGone = {},
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
    fun `a second 401 is the answer, not a reason to ask again`() {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setResponseCode(401))

        assertEquals(401, call(request()).code)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun `a request for the learner in use is sent as them`() {
        server.enqueue(MockResponse())

        call(request(learner = learnerKey(UID, ADA.id))).close()

        assertEquals("Bearer session-1", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun `a request for a learner no longer in use is refused before it is sent`() {
        assertThrows(IOException::class.java) { call(request(learner = learnerKey(UID, BAYO.id))) }
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `an exchange refused over HTTP fails the call the way a lost connection does`() {
        refuseExchange = true

        assertThrows(IOException::class.java) { call(request()) }
        assertEquals(0, server.requestCount)
    }

    private fun request(learner: String? = null): Request = Request.Builder()
        .url(server.url("/api/voice/lesson"))
        .apply { learner?.let { tag(RequestLearner::class.java, RequestLearner(it)) } }
        .build()

    private fun call(request: Request) = client.newCall(request).execute()
}

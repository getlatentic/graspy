package com.latentic.graspy.account

import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.learners.ChoiceProblem
import com.latentic.graspy.learners.choiceProblem
import com.latentic.graspy.network.refusalCode
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** Each call as apps/server/src/app/api/account_routes.py and routes.py take it. */
class AccountApiTest {
    private val server = MockWebServer()
    private val retrofit = Retrofit.Builder()
        .baseUrl(server.url("/"))
        .client(OkHttpClient())
        .addConverterFactory(apiJson.asConverterFactory("application/json".toMediaType()))
        .build()
    private val accounts = retrofit.create(AccountApi::class.java)
    private val sessions = retrofit.create(SessionApi::class.java)

    @After
    fun close() = server.close()

    @Test
    fun `a first exchange names the device and the sign-in, and no learner`() = runBlocking {
        server.enqueue(json("""{"token":"t","expiresIn":43200,"signedIn":true,"learner":null}"""))

        val issued = sessions.session(SessionRequestDto(DEVICE, "google-id-token"))

        val sent = server.takeRequest()
        assertEquals("POST /api/session", "${sent.method} ${sent.path}")
        assertEquals("""{"deviceId":"$DEVICE","firebaseIdToken":"google-id-token"}""", sent.body.readUtf8())
        assertEquals(IssuedSessionDto("t", 43_200, signedIn = true, learner = null), issued)
    }

    @Test
    fun `the account's learners are read with their camel-case fields and the consents held for them`() = runBlocking {
        server.enqueue(
            json(
                """{"learners":[
                {"id":"${ADA.id}","name":"Ada","createdAt":1,"serviceConsent":{"noticeVersion":1,"grantedAt":5},"voiceConsent":null},
                {"id":"${CARA.id}","name":"Cara","createdAt":3,"serviceConsent":null,"voiceConsent":{"noticeVersion":1,"retentionDays":90}}
                ]}""",
            ),
        )

        val learners = accounts.learners().learners

        assertEquals(listOf(ADA, CARA.copy(voiceConsent = KeptRecordingsDto(1, 90))), learners)
        assertEquals("GET /api/account/learners", server.takeRequest().let { "${it.method} ${it.path}" })
    }

    @Test
    fun `adding a learner always says whoever adds them is them or their guardian`() = runBlocking {
        server.enqueue(json("""{"id":"cccccccccccc","name":"Tolu","createdAt":3}""").setResponseCode(201))

        accounts.add(NewLearnerDto("Tolu", guardian = true))

        assertEquals("""{"name":"Tolu","guardian":true}""", server.takeRequest().body.readUtf8())
    }

    @Test
    fun `a learner added with a parent's consent sends the notice's version and the fresh token beside guardian`() = runBlocking {
        server.enqueue(json("""{"id":"cccccccccccc","name":"Tolu","createdAt":3,"serviceConsent":{"noticeVersion":1,"grantedAt":9}}""").setResponseCode(201))

        val added = accounts.add(NewLearnerDto("Tolu", guardian = true, consent = ConsentProofDto(1, "fresh-id-token")))

        assertEquals(
            """{"name":"Tolu","guardian":true,"consent":{"noticeVersion":1,"firebaseIdToken":"fresh-id-token"}}""",
            server.takeRequest().body.readUtf8(),
        )
        assertEquals(ServiceConsentDto(1, 9), added.serviceConsent)
    }

    @Test
    fun `a parent's agreement for a learner already added is a PUT to the learner's consent`() = runBlocking {
        server.enqueue(json("""{"noticeVersion":1,"grantedAt":9}"""))

        val agreed = accounts.agree(CARA.id, ConsentProofDto(1, "fresh-id-token"))

        val sent = server.takeRequest()
        assertEquals("PUT /api/account/learners/${CARA.id}/consent", "${sent.method} ${sent.path}")
        assertEquals("""{"noticeVersion":1,"firebaseIdToken":"fresh-id-token"}""", sent.body.readUtf8())
        assertEquals(ServiceConsentDto(1, 9), agreed)
    }

    @Test
    fun `printing a consent never shows the token`() {
        val printed = listOf(ConsentProofDto(1, "secret-token"), NewLearnerDto("Tolu", true, ConsentProofDto(1, "secret-token"))).joinToString()

        assertFalse(printed, printed.contains("secret-token"))
    }

    @Test
    fun `the first choice names the device, and any later one sends an empty body`() = runBlocking {
        repeat(2) { server.enqueue(json("""{"token":"t","expiresIn":1,"signedIn":true,"learner":{"id":"${ADA.id}","name":"Ada","createdAt":1}}""")) }

        accounts.session(ADA.id, ChosenLearnerDto(DEVICE))
        accounts.session(ADA.id, ChosenLearnerDto())

        val first = server.takeRequest()
        assertEquals("/api/account/learners/${ADA.id}/session", first.path)
        assertEquals("""{"deviceId":"$DEVICE"}""", first.body.readUtf8())
        assertEquals("{}", server.takeRequest().body.readUtf8())
    }

    @Test
    fun `renaming, removing and deleting the account reach their routes`() = runBlocking {
        server.enqueue(json("""{"id":"${ADA.id}","name":"Ada L","createdAt":1}"""))
        server.enqueue(json("""{"learners":[]}"""))
        server.enqueue(MockResponse().setResponseCode(204))

        accounts.rename(ADA.id, LearnerNameDto("Ada L"))
        accounts.remove(ADA.id)
        accounts.delete()

        val renamed = server.takeRequest()
        assertEquals("PATCH /api/account/learners/${ADA.id} {\"name\":\"Ada L\"}", "${renamed.method} ${renamed.path} ${renamed.body.readUtf8()}")
        assertEquals("DELETE /api/account/learners/${ADA.id}", server.takeRequest().let { "${it.method} ${it.path}" })
        assertEquals("DELETE /api/account", server.takeRequest().let { "${it.method} ${it.path}" })
    }

    @Test
    fun `a ninth learner is refused as the account being full`() {
        server.enqueue(
            json("""{"detail":{"error":"An account holds at most 8 learners","code":"too_many_learners"}}""").setResponseCode(409),
        )

        val refused = assertThrows(HttpException::class.java) {
            runBlocking { accounts.add(NewLearnerDto("Ninth", guardian = true)) }
        }

        assertEquals("too_many_learners", refusalCode(refused))
        assertEquals(ChoiceProblem.FULL, choiceProblem(refused))
        assertEquals(ChoiceProblem.OFFLINE, choiceProblem(UnsentChanges(offline = true)))
        assertEquals(ChoiceProblem.UNSENT, choiceProblem(UnsentChanges(offline = false)))
        assertEquals(ChoiceProblem.FAILED, choiceProblem(java.io.IOException("offline")))
    }

    private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)
}

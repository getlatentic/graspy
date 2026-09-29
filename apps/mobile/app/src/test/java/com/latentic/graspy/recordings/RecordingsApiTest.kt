package com.latentic.graspy.recordings

import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.network.refusalCode
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** Each call as apps/server/src/app/api/account_voice_routes.py takes it, and docs/API.md (Recordings) promises. */
class RecordingsApiTest {
    private val server = MockWebServer()
    private val api = Retrofit.Builder()
        .baseUrl(server.url("/"))
        .client(OkHttpClient())
        .addConverterFactory(apiJson.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(RecordingsApi::class.java)

    @After
    fun close() = server.close()

    private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)

    private fun sent() = server.takeRequest().let { "${it.method} ${it.path}" to it.body.readUtf8() }

    @Test
    fun `the overview is read with the consent, the kept recordings and where the next page starts`() = runBlocking {
        server.enqueue(
            json(
                """{"consent":{"noticeVersion":1,"retentionDays":90,"grantedAt":5},
                "recordings":[{"id":"r1","recordedAt":2000,"expiresAt":9000,"lesson":"Two times table","transcript":"two fours",
                "durationSeconds":4,"bytes":64000},{"id":"r2","recordedAt":1000,"expiresAt":8000,"lesson":null,"transcript":null,
                "durationSeconds":null,"bytes":10}],"nextBefore":1000}""",
            ),
        )

        val page = api.overview("aaaaaaaaaaaa", before = 2_000)

        assertEquals("GET /api/account/learners/aaaaaaaaaaaa/voice?before=2000", sent().first)
        assertEquals(VoiceConsentDto(1, 90, 5), page.consent)
        assertEquals(listOf("r1", "r2"), page.recordings.map { it.id })
        assertEquals("Two times table", page.recordings[0].lesson)
        assertEquals(null, page.recordings[1].durationSeconds)
        assertEquals(1_000L, page.nextBefore)
    }

    @Test
    fun `an overview of recordings not kept has no consent, no recordings and no next page`() = runBlocking {
        server.enqueue(json("""{"consent":null,"recordings":[],"nextBefore":null}"""))

        val page = api.overview("aaaaaaaaaaaa")

        assertEquals("GET /api/account/learners/aaaaaaaaaaaa/voice", sent().first)
        assertEquals(VoiceOverviewDto(null, emptyList(), null), page)
    }

    @Test
    fun `agreeing to keep them sends the notice version, the days and the fresh token, and reads the consent back`() = runBlocking {
        server.enqueue(json("""{"noticeVersion":1,"retentionDays":365,"grantedAt":9}"""))

        val consent = api.keep("aaaaaaaaaaaa", KeepRecordingsDto(1, 365, "fresh-id-token"))

        assertEquals(
            "PUT /api/account/learners/aaaaaaaaaaaa/voice/consent" to
                """{"noticeVersion":1,"retentionDays":365,"firebaseIdToken":"fresh-id-token"}""",
            sent(),
        )
        assertEquals(VoiceConsentDto(1, 365, 9), consent)
    }

    @Test
    fun `printing the request never shows the token`() {
        assertFalse(KeepRecordingsDto(1, 30, "secret-token").toString().contains("secret-token"))
    }

    @Test
    fun `stopping is a DELETE of the consent, with deleteRecordings saying whether the kept ones go too`() = runBlocking {
        repeat(2) { server.enqueue(json("""{"deleted":0,"more":false}""")) }

        api.stop("aaaaaaaaaaaa", deleteRecordings = false)
        api.stop("aaaaaaaaaaaa", deleteRecordings = true)

        assertEquals("DELETE /api/account/learners/aaaaaaaaaaaa/voice/consent?deleteRecordings=false", sent().first)
        assertEquals("DELETE /api/account/learners/aaaaaaaaaaaa/voice/consent?deleteRecordings=true", sent().first)
    }

    @Test
    fun `one recording and all of them are DELETEs of their routes`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))
        server.enqueue(json("""{"deleted":3,"more":true}"""))

        api.delete("aaaaaaaaaaaa", "r1")
        val step = api.deleteAll("aaaaaaaaaaaa")

        assertEquals("DELETE /api/account/learners/aaaaaaaaaaaa/voice/recordings/r1", sent().first)
        assertEquals("DELETE /api/account/learners/aaaaaaaaaaaa/voice/recordings", sent().first)
        assertEquals(DeletedDto(3, true), step)
    }

    @Test
    fun `the audio is read as the bytes graspy answers, and a recording gone is a refusal with its code`() = runBlocking {
        server.enqueue(MockResponse().setHeader("Content-Type", "audio/wav").setBody(Buffer().write("RIFF....".toByteArray())))
        server.enqueue(
            json("""{"detail":{"error":"That recording is not kept","code":"recording_gone"}}""").setResponseCode(404),
        )

        val heard = api.audio("aaaaaaaaaaaa", "r1").use { it.bytes() }
        val gone = assertThrows(HttpException::class.java) { runBlocking { api.audio("aaaaaaaaaaaa", "r2") } }

        assertEquals("RIFF....", String(heard))
        assertEquals("GET /api/account/learners/aaaaaaaaaaaa/voice/recordings/r1/audio", sent().first)
        assertEquals("recording_gone", refusalCode(gone))
    }
}

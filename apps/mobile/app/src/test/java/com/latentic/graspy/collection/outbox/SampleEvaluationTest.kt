package com.latentic.graspy.collection.outbox

import com.latentic.graspy.collection.SampleApi
import com.latentic.graspy.collection.VoiceRefusal
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** Marking a sent recording, as apps/server/src/app/voice/worker_evaluation.py answers it. */
class SampleEvaluationTest {
    private val server = MockWebServer()
    private val api = Retrofit.Builder()
        .baseUrl(server.url("/"))
        .client(OkHttpClient())
        .addConverterFactory(apiJson.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(SampleApi::class.java)

    @After
    fun close() = server.close()

    @Test
    fun `a recording graspy marked is answered with its result`() = runBlocking {
        server.enqueue(json(MARKED))

        val marked = api.evaluateSample("gvm_1")

        assertEquals("correct", marked.decision)
        assertEquals("POST /api/voice/samples/gvm_1/evaluation", server.takeRequest().let { "${it.method} ${it.path}" })
    }

    @Test
    fun `audio graspy no longer has is graspy's refusal, and is not sent again`() {
        server.enqueue(NOT_READY)

        val refused = assertThrows(HttpException::class.java) { runBlocking { api.evaluateSample("gvm_1") } }

        assertEquals(VoiceRefusal.AUDIO_NOT_READY, VoiceRefusal.of(refused))
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `a failed turn not yet due says how long to wait`() = runBlocking {
        server.enqueue(json("""{"sample_id":"gvm_1","state":"processing","retry_after_ms":120000}""").setResponseCode(202))

        val waiting = api.evaluateSample("gvm_1")

        assertEquals("processing" to 120_000L, waiting.state to waiting.retryAfterMs)
    }

    private companion object {
        const val MARKED = """{"sample_id":"gvm_1","state":"complete","transcript":"four","decision":"correct","feedback":"Yes","provider":"intron_sync","latency_ms":900}"""
        val NOT_READY: MockResponse get() = json("""{"detail":"sample audio is not ready","code":"audio_not_ready"}""").setResponseCode(409)

        fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)
    }
}

package com.latentic.graspy.practice

import com.latentic.graspy.collection.SampleApi
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Test
import retrofit2.Retrofit

class TeacherAudioApiTest {
    @Test
    fun `prefetch asks for the fixed utterance and app language`() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("RIFFvoice"))
        server.start()
        try {
            val api = Retrofit.Builder()
                .baseUrl(server.url("/"))
                .client(OkHttpClient())
                .build()
                .create(SampleApi::class.java)

            assertEquals(
                "RIFFvoice",
                api.teacherAudio(TeacherUtterance.PROMPT.wireValue, "pcm").body()?.string(),
            )
            assertEquals("/api/voice/teacher-audio/prompt?language=pcm", server.takeRequest().path)
        } finally {
            server.close()
        }
    }

    @Test
    fun `her reply is asked for by the turn it belongs to, never by its words`() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("OggSreply"))
        server.start()
        try {
            val api = Retrofit.Builder()
                .baseUrl(server.url("/"))
                .client(OkHttpClient())
                .build()
                .create(SampleApi::class.java)

            assertEquals("OggSreply", api.replyAudio("gvm_2026_04_1abc").body()?.string())
            assertEquals("/api/voice/samples/gvm_2026_04_1abc/reply-audio", server.takeRequest().path)
        } finally {
            server.close()
        }
    }
}

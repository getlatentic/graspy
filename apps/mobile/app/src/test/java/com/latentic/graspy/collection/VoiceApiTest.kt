package com.latentic.graspy.collection

import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.network.fromGraspy
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** Each voice call as apps/server/src/app/api/voice_routes.py serves it. */
class VoiceApiTest {
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
    fun `the lesson and the catalogue are asked for by class and language`() = runBlocking {
        server.enqueue(json("""{"lessons":[],"day":"2026-09-26"}"""))
        server.enqueue(json(MOVE))

        api.catalogue("primary_3", "yo")
        api.lessonMove("primary_3", "yo", "mathematics.table-2")

        assertEquals("GET /api/voice/catalogue?learner_class=primary_3&language=yo", sent())
        assertEquals("GET /api/voice/lesson?learner_class=primary_3&language=yo&plan=mathematics.table-2", sent())
    }

    @Test
    fun `a heard step is recorded with its plan and event`() = runBlocking {
        server.enqueue(json("""{"plan_id":"mathematics.table-2","event_id":"present"}"""))

        api.lessonEventHeard(LessonEventDto("mathematics.table-2", "present", "primary_3"))

        val request = server.takeRequest()
        assertEquals("POST /api/voice/lesson/events", "${request.method} ${request.path}")
        assertEquals("""{"plan_id":"mathematics.table-2","event_id":"present","learner_class":"primary_3"}""", request.body.readUtf8())
    }

    @Test
    fun `a recording is created, uploaded to the path the server names, then marked`() = runBlocking {
        server.enqueue(json("""{"sample_id":"gvm_1","state":"awaiting_audio","upload_path":"/api/voice/samples/gvm_1/audio"}""").setResponseCode(201))
        server.enqueue(json("""{"sample_id":"gvm_1","state":"ready"}"""))
        server.enqueue(json("""{"sample_id":"gvm_1","state":"complete","transcript":"four","decision":"correct","feedback":"Yes","provider":"intron_sync","latency_ms":900}"""))

        val created = api.createSample("key-1", SAMPLE)
        api.uploadAudio(requireNotNull(created.uploadPath), "RIFF".toByteArray().toRequestBody("audio/wav".toMediaType()))
        val marked = api.evaluateSample(created.sampleId)

        val create = server.takeRequest()
        assertEquals("POST /api/voice/samples key-1", "${create.method} ${create.path} ${create.getHeader("Idempotency-Key")}")
        val upload = server.takeRequest()
        assertEquals("PUT /api/voice/samples/gvm_1/audio audio/wav 4", "${upload.method} ${upload.path} ${upload.getHeader("Content-Type")} ${upload.getHeader("Content-Length")}")
        assertEquals("POST /api/voice/samples/gvm_1/evaluation", sent())
        assertEquals("correct", marked.decision)
    }

    @Test
    fun `a teacher line already on the phone is asked after with its version`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(304))

        assertEquals(304, api.teacherAudio("prompt", "en", "\"v3\"").code())

        val request = server.takeRequest()
        assertEquals("/api/voice/teacher-audio/prompt?language=en \"v3\"", "${request.path} ${request.getHeader("If-None-Match")}")
    }

    @Test
    fun `a refusal is the voice API's only with its own body, and reading it leaves the body for the reason`() {
        listOf(
            Triple(409, """{"detail":"that step was not offered to this learner","code":"step_not_offered"}""", true),
            Triple(409, """{"detail":{"error":"Choose a learner first","code":"learner_required"}}""", true),
            Triple(413, """{"detail":"Request body too large"}""", true),
            Triple(405, """{"detail":"Method Not Allowed"}""", true),
            Triple(404, """{"detail":"Not Found"}""", false),
            Triple(404, "<html>Not Found</html>", false),
            Triple(410, "", false),
            Triple(451, """{"error":"Unavailable For Legal Reasons"}""", false),
        ).forEach { (status, body, graspys) ->
            server.enqueue(json(body).setResponseCode(status))
            val refused = assertThrows(HttpException::class.java) { runBlocking { api.createSample("key-1", SAMPLE) } }

            assertEquals("$status $body", graspys, fromGraspy(refused))
            assertEquals(body, refused.response()?.errorBody()?.string())
        }
    }

    private fun sent() = server.takeRequest().let { "${it.method} ${it.path}" }

    private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)

    private companion object {
        val SAMPLE = CreateSampleRequestDto(
            speakerId = "participant",
            languagePair = "yo-en",
            lessonLanguage = "yo",
            task = "lesson",
            topic = "multiplication",
            consent = ConsentDto(granted = true, scope = "voice_lesson"),
        )
        const val MOVE = """{"revision":1,"day":"2026-09-26","move":{"kind":"event","plan_id":"mathematics.table-2",
            "event_id":"present","event":"present_content","subject":"mathematics","title":{"en":"Two"},
            "say":"plan.mathematics.table-2.present","say_text":{"en":"Two times one is two."},"reason":"start"}}"""
    }
}

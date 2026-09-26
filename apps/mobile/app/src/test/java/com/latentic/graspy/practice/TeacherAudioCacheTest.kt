package com.latentic.graspy.practice

import com.latentic.graspy.collection.SampleApi
import java.io.File
import java.io.IOException
import java.nio.file.Files
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit

class TeacherAudioCacheTest {
    private val server = MockWebServer()
    private lateinit var directory: File
    private lateinit var api: SampleApi

    @Before
    fun start() {
        server.start()
        directory = Files.createTempDirectory("teacher-audio").toFile()
        api = Retrofit.Builder().baseUrl(server.url("/")).client(OkHttpClient()).build().create(SampleApi::class.java)
    }

    @After
    fun stop() {
        server.close()
        directory.deleteRecursively()
    }

    /** A new cache over the same folder is the next app session. */
    private fun session() = TeacherAudioCache(directory) { line, language, held ->
        when (line) {
            is TeacherUtterance -> api.teacherAudio(line.wireValue, language, held)
            is TeacherReply -> api.replyAudio(line.sampleId)
        }
    }

    private fun recording(body: String, version: String) =
        MockResponse().setBody(body).setHeader("ETag", "\"$version\"")

    @Test
    fun `the first time a line is needed it is fetched and kept with its version`() = runBlocking {
        server.enqueue(recording("old words", "v1"))

        val audio = session().prepare(TeacherUtterance.CORRECT_SHORT, "en")

        assertEquals("old words", audio.readText())
        assertNull(server.takeRequest().getHeader("If-None-Match"))
    }

    @Test
    fun `within one session a line is not asked about twice`() = runBlocking {
        server.enqueue(recording("old words", "v1"))
        val session = session()

        session.prepare(TeacherUtterance.CORRECT_SHORT, "en")
        session.prepare(TeacherUtterance.CORRECT_SHORT, "en")

        assertEquals(1, server.requestCount)
    }

    @Test
    fun `the next session keeps a line whose words have not changed`() = runBlocking {
        server.enqueue(recording("old words", "v1"))
        session().prepare(TeacherUtterance.CORRECT_SHORT, "en")
        server.takeRequest()
        server.enqueue(MockResponse().setResponseCode(304).setHeader("ETag", "\"v1\""))

        val audio = session().prepare(TeacherUtterance.CORRECT_SHORT, "en")

        assertEquals("\"v1\"", server.takeRequest().getHeader("If-None-Match"))
        assertEquals("old words", audio.readText())
    }

    @Test
    fun `the next session hears a rewritten line with its new words`() = runBlocking {
        server.enqueue(recording("old words", "v1"))
        session().prepare(TeacherUtterance.CORRECT_SHORT, "en")
        server.enqueue(recording("new words", "v2"))

        val audio = session().prepare(TeacherUtterance.CORRECT_SHORT, "en")

        assertEquals("new words", audio.readText())
    }

    @Test
    fun `a line already on the phone still plays when the server cannot be reached`() = runBlocking {
        server.enqueue(recording("old words", "v1"))
        session().prepare(TeacherUtterance.CORRECT_SHORT, "en")
        val offline = TeacherAudioCache(directory) { _, _, _ -> throw IOException("no network") }

        assertEquals("old words", offline.prepare(TeacherUtterance.CORRECT_SHORT, "en").readText())
    }

    @Test
    fun `different lines download side by side`() = runBlocking {
        val secondStarted = CompletableDeferred<Unit>()
        val cache = TeacherAudioCache(directory) { line, _, _ ->
            // The first download finishes only once the second has begun: one lock for every line would
            // leave them waiting on each other for ever.
            if (line == TeacherUtterance.CORRECT_SHORT) secondStarted.await() else secondStarted.complete(Unit)
            retrofit2.Response.success("voice of ${line.fileName}".toResponseBody(), okhttp3.Headers.headersOf("ETag", "\"v\""))
        }

        withTimeout(5_000) {
            listOf(TeacherUtterance.CORRECT_SHORT, TeacherUtterance.NO_SPEECH)
                .map { async { cache.prepare(it, "en") } }
                .awaitAll()
        }

        assertEquals("voice of correct", File(directory, "en-correct.audio").readText())
    }

    @Test
    fun `her reply to one answer is fetched once and never asked about again`() = runBlocking {
        val reply = TeacherReply("gvm_2026_04_1abc")
        server.enqueue(MockResponse().setBody("her own words"))
        session().prepare(reply, "en")
        server.takeRequest()

        val audio = session().prepare(reply, "en")

        assertEquals("her own words", audio.readText())
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `a line never fetched cannot play offline`() {
        val offline = TeacherAudioCache(directory) { _, _, _ -> throw IOException("no network") }

        assertThrows(IOException::class.java) { runBlocking { offline.prepare(TeacherUtterance.CORRECT_SHORT, "en") } }
    }
}

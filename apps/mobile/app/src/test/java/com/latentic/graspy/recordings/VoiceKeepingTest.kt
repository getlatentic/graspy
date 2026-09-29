package com.latentic.graspy.recordings

import com.latentic.graspy.auth.FreshSignIn
import java.io.File
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** What the parent's screen asks of graspy for a learner's kept recordings. */
class VoiceKeepingTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val api = FakeRecordingsApi((1L..7L).map { kept("r$it", it * 1_000) }, VoiceConsentDto(1, 30, 1L))
    private val cache get() = File(folder.root, "kept")
    private val keeping get() = VoiceKeeping(api, cache)

    @Test
    fun `stopping and deleting asks again while more is kept, and counts what went`() = runBlocking {
        api.deletesPerCall = 3

        val deleted = keeping.stop(LEARNER, deleteRecordings = true)

        assertEquals(7, deleted)
        assertEquals(3, api.calls.count { it == "stop:$LEARNER:true" })
        assertTrue(api.kept.isEmpty())
    }

    @Test
    fun `stopping and leaving the recordings asks once and deletes none`() = runBlocking {
        val deleted = keeping.stop(LEARNER, deleteRecordings = false)

        assertEquals(0, deleted)
        assertEquals(listOf("stop:$LEARNER:false"), api.calls)
        assertEquals(7, api.kept.size)
    }

    @Test
    fun `deleting all asks again until more is false`() = runBlocking {
        api.deletesPerCall = 2

        val deleted = keeping.deleteAll(LEARNER)

        assertEquals(7, deleted)
        assertEquals(4, api.calls.count { it == "deleteAll:$LEARNER" })
        assertTrue(api.kept.isEmpty())
    }

    @Test
    fun `deleting all is asked once when one call takes them all`() = runBlocking {
        keeping.deleteAll(LEARNER)

        assertEquals(1, api.calls.count { it == "deleteAll:$LEARNER" })
    }

    @Test
    fun `a call that deletes nothing and yet says more is kept is not asked for ever`() {
        api.deletesNothing = true

        assertThrows(IOException::class.java) { runBlocking { keeping.deleteAll(LEARNER) } }

        assertEquals(1, api.calls.count { it == "deleteAll:$LEARNER" })
    }

    @Test
    fun `keeping sends the days and the fresh sign-in's token`() = runBlocking {
        val consent = keeping.keep(LEARNER, 90, FreshSignIn("fresh-id-token"))

        assertEquals(90, consent.retentionDays)
        assertEquals(listOf("keep:$LEARNER:1:90:fresh-id-token"), api.calls)
    }

    @Test
    fun `a recording is fetched to a new file in the cache directory`() = runBlocking {
        api.audio = "the child's voice".toByteArray()

        val file = keeping.fetch(LEARNER, "r3")

        assertEquals(cache, file.parentFile)
        assertEquals("the child's voice", file.readText())
    }

    @Test
    fun `a recording that cannot be fetched leaves no file behind`() {
        assertThrows(retrofit2.HttpException::class.java) { runBlocking { keeping.fetch(LEARNER, "r-gone") } }

        assertTrue(cache.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun `forgetting what was fetched removes every file`() = runBlocking {
        keeping.fetch(LEARNER, "r1")
        keeping.fetch(LEARNER, "r2")

        keeping.forgetFetched()

        assertFalse(cache.exists())
    }

    @Test
    fun `a recording whose connection is lost part way leaves its half in no file`() {
        api.audioFailsMidway = true

        assertThrows(IOException::class.java) { runBlocking { keeping.fetch(LEARNER, "r3") } }

        assertTrue(cache.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun `a fetch its caller stops waiting for leaves no file`() = runBlocking {
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>().also { api.audioGate = it }
        val fetching = launch(Dispatchers.Default) { keeping.fetch(LEARNER, "r3") }
        while (api.calls.none { it.startsWith("audio") }) delay(10)

        fetching.cancel()
        gate.complete(Unit)
        fetching.join()

        assertTrue(cache.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun `forgetting kept recordings removes the directory and what is in it`() {
        cache.mkdirs()
        File(cache, "a.wav").writeText("a child's voice")

        forgetKeptRecordings(cache)

        assertFalse(cache.exists())
    }
}

package com.latentic.graspy.mcp

import com.latentic.graspy.account.SessionRefusal
import java.io.IOException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A view's calls the server did not take are kept and sent in order, as the web's MCP outbox does. */
@RunWith(RobolectricTestRunner::class)
class McpOutboxTest {
    private val dao = FakeDao()
    private val sent = mutableListOf<String>()
    /** Why the server does not take a call now; null once it does. */
    private var failure: IOException? = IOException("no connection")
    private var learning = true
    private val outbox = McpOutbox(dao, "uid/ada", { name, _ ->
        failure?.let { throw it }
        if (name == "refused") throw McpRefusal("refused")
        buildJsonObject { put("ok", true) }.also { sent += name }
    }, { learning }) { 1L }

    @Test
    fun `offline, a call is kept and the view is told so`() = runBlocking {
        val told = outbox.callOrKeep("answer_practice", buildJsonObject { put("answer", 2) })

        assertEquals(KEPT_RESULT, told)
        assertEquals("This is kept on the device and sent later.", told.getValue("content").jsonArray[0].jsonObject.string("text"))
        assertEquals(listOf("answer_practice"), dao.kept("uid/ada").map { it.name })
    }

    @Test
    fun `a call the server refuses is its answer, never kept`() {
        failure = null

        assertThrows(McpRefusal::class.java) { runBlocking { outbox.callOrKeep("refused", JsonObject(emptyMap())) } }
        assertEquals(0, dao.rows.size)
    }

    @Test
    fun `a call is kept on a refused session or a server failing, and sent once the server takes it`() = runBlocking {
        val passing = listOf(
            SessionRefusal("graspy did not issue a session"),
            McpRefusal("tools/call failed: HTTP 503", aboutTheCall = false),
            McpRefusal("tools/call refused: {\"code\":-32603}", aboutTheCall = false),
        )
        passing.forEach { failure = it; outbox.callOrKeep("answer_check", JsonObject(emptyMap())) }
        assertEquals(3, dao.rows.size)

        failure = null
        assertEquals(3, outbox.sendKept())
        assertEquals(List(3) { "answer_check" }, sent)
    }

    @Test
    fun `nothing is kept for a learner the device has left, and the failure stands`() {
        learning = false
        val refused = SessionRefusal("That learner is no longer learning on this device")
        failure = refused

        assertSame(refused, assertThrows(SessionRefusal::class.java) { runBlocking { outbox.callOrKeep("answer_check", JsonObject(emptyMap())) } })
        assertEquals(0, dao.rows.size)
    }

    @Test
    fun `what was kept waits while the server does not take it, and goes once it does`() = runBlocking {
        outbox.callOrKeep("first", JsonObject(emptyMap()))
        listOf(SessionRefusal("graspy did not issue a session"), McpRefusal("tools/call failed: HTTP 429", aboutTheCall = false)).forEach {
            failure = it
            assertEquals(0, outbox.sendKept())
            assertFalse(outbox.sentEverything())
        }
        assertEquals(listOf("first"), dao.kept("uid/ada").map { it.name })

        failure = null
        assertTrue(outbox.sentEverything())
        assertEquals(listOf("first"), sent)
    }

    @Test
    fun `kept calls go in order, one the server refuses is dropped, and the run stops at one it did not take`() = runBlocking {
        outbox.callOrKeep("first", JsonObject(emptyMap()))
        outbox.callOrKeep("refused", JsonObject(emptyMap()))
        outbox.callOrKeep("second", JsonObject(emptyMap()))
        assertEquals(0, outbox.sendKept())

        failure = null
        assertEquals(3, outbox.sendKept())
        assertEquals(listOf("first", "second"), sent)
        assertEquals(0, dao.rows.size)
    }

    private class FakeDao : KeptCallDao {
        val rows = mutableListOf<KeptCallEntity>()

        override suspend fun keep(call: KeptCallEntity) {
            rows += call.copy(id = rows.size + 1L)
        }

        override suspend fun kept(ownerId: String) = rows.filter { it.ownerId == ownerId }

        override suspend fun forget(id: Long) {
            rows.removeAll { it.id == id }
        }
    }
}

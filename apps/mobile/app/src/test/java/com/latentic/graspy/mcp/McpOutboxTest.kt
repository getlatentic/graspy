package com.latentic.graspy.mcp

import java.io.IOException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/** A view's calls made with no connection are kept and sent in order, as the web's MCP outbox does. */
class McpOutboxTest {
    private val dao = FakeDao()
    private val sent = mutableListOf<String>()
    private var online = false
    private val outbox = McpOutbox(dao, "uid/ada", { name, _ ->
        when {
            name == "refused" -> throw McpRefusal("refused")
            !online -> throw IOException("no connection")
            else -> buildJsonObject { put("ok", true) }.also { sent += name }
        }
    }) { 1L }

    @Test
    fun `offline, a call is kept and the view is told so`() = runBlocking {
        assertEquals(KEPT_RESULT, outbox.callOrKeep("answer_practice", buildJsonObject { put("answer", 2) }))
        assertEquals(listOf("answer_practice"), dao.kept("uid/ada").map { it.name })
    }

    @Test
    fun `a refusal is the server's answer, never kept`() {
        assertThrows(McpRefusal::class.java) { runBlocking { outbox.callOrKeep("refused", JsonObject(emptyMap())) } }
        assertEquals(0, dao.rows.size)
    }

    @Test
    fun `kept calls go in order once there is a connection, and stop when there is none`() = runBlocking {
        outbox.callOrKeep("first", JsonObject(emptyMap()))
        outbox.callOrKeep("second", JsonObject(emptyMap()))
        assertEquals(0, outbox.sendKept())

        online = true
        assertEquals(2, outbox.sendKept())
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

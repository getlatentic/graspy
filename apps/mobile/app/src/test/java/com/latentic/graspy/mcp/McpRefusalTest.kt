package com.latentic.graspy.mcp

import com.latentic.graspy.account.inMemoryDatabase
import java.io.IOException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * What graspy's MCP server answers, read as the web's outbox reads it (lib/mcp/refusal.ts): only a refusal of
 * the call itself lets kept work go. Through the real client, against a server answering each way.
 */
@RunWith(RobolectricTestRunner::class)
class McpRefusalTest {
    /** How tools/call is answered, given the request's id; null answers it with a result. */
    private var toolAnswer: ((JsonElement) -> MockResponse)? = null
    private var catalogueStatus: Int? = null
    private val web = MockWebServer().also { server ->
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = answer(mcpJson.parseToJsonElement(request.body.readUtf8()).jsonObject)
        }
    }
    private val mcp = McpClient(OkHttpClient(), web.url("/mcp"))
    private val database = inMemoryDatabase()
    private val outbox = McpOutbox(database.keptCallDao(), OWNER, mcp::callTool, { true })

    @After
    fun close() {
        database.close()
        web.shutdown()
    }

    @Test
    fun `a 4xx about the call is a refusal of it`() {
        listOf(400, 404, 409, 413, 422).forEach { status ->
            toolAnswer = { MockResponse().setResponseCode(status) }
            assertTrue("HTTP $status", callFailure().refusesTheCall())
        }
    }

    @Test
    fun `a server failing, a timeout, a rate limit or a session refused over HTTP is not`() {
        listOf(401, 403, 408, 425, 429, 500, 502, 503, 504, 520).forEach { status ->
            toolAnswer = { MockResponse().setResponseCode(status) }
            val failure = callFailure()
            assertFalse("HTTP $status", failure.refusesTheCall())
            assertFalse("HTTP $status is an answer, not a lost connection", failure.isUnreachable())
        }
    }

    @Test
    fun `JSON-RPC's invalid request, method not found and invalid params refuse the call, and nothing else does`() {
        mapOf(-32600 to true, -32601 to true, -32602 to true, -32603 to false, -32000 to false, -32002 to false).forEach { (code, refuses) ->
            toolAnswer = { id -> rpc(id) { putJsonObject("error") { put("code", code); put("message", "no") } } }
            assertEquals("JSON-RPC $code", refuses, callFailure().refusesTheCall())
        }
    }

    @Test
    fun `an answer that cannot be read is not a refusal`() {
        listOf(
            MockResponse().setHeader("Content-Type", "application/json").setBody(""),
            MockResponse().setHeader("Content-Type", "text/html").setBody("<html>Bad gateway</html>"),
            MockResponse().setHeader("Content-Type", "text/event-stream").setBody(""),
        ).forEach { reply ->
            toolAnswer = { reply }
            assertFalse(callFailure().refusesTheCall())
        }
        toolAnswer = { id -> rpc(id) {} }
        assertFalse("a reply with no result", callFailure().refusesTheCall())
    }

    @Test
    fun `a tool no longer offered to views is refused`() {
        assertTrue(callFailure("rebuild_plan").refusesTheCall())
    }

    @Test
    fun `a catalogue that cannot be read says nothing of the call, whatever the status`() {
        catalogueStatus = 404
        assertFalse(callFailure().refusesTheCall())
    }

    @Test
    fun `a live call on a 503, 429, 401 or 403 is kept, the view told so, and the run sends it once the server takes it`() = runBlocking {
        listOf(503, 429, 401, 403).forEach { status ->
            toolAnswer = { MockResponse().setResponseCode(status) }
            assertEquals("HTTP $status", KEPT_RESULT, outbox.callOrKeep(ANSWER_CHECK, JsonObject(emptyMap())))
        }
        assertEquals(0, outbox.sendKept())
        assertEquals(4, database.keptCallDao().kept(OWNER).size)

        toolAnswer = null
        assertEquals(4, outbox.sendKept())
        assertTrue(database.keptCallDao().kept(OWNER).isEmpty())
    }

    @Test
    fun `a live call the server refuses is not kept, and a kept one it refuses is dropped`() = runBlocking {
        toolAnswer = { MockResponse().setResponseCode(413) }
        try {
            outbox.callOrKeep(ANSWER_CHECK, JsonObject(emptyMap()))
            fail("A refused call is the server's answer")
        } catch (refused: McpRefusal) {
            assertTrue(refused.refusesTheCall())
        }
        assertTrue(database.keptCallDao().kept(OWNER).isEmpty())

        toolAnswer = { MockResponse().setResponseCode(503) }
        outbox.callOrKeep(ANSWER_CHECK, JsonObject(emptyMap()))
        toolAnswer = { id -> rpc(id) { putJsonObject("error") { put("code", -32602); put("message", "Invalid arguments") } } }
        assertEquals(1, outbox.sendKept())
        assertTrue(outbox.sentEverything())
    }

    @Test
    fun `a kept call stays while the catalogue cannot be read`() = runBlocking {
        catalogueStatus = 503
        outbox.callOrKeep(ANSWER_CHECK, JsonObject(emptyMap()))
        catalogueStatus = 404
        assertFalse(outbox.sentEverything())
        assertEquals(1, database.keptCallDao().kept(OWNER).size)

        catalogueStatus = null
        assertTrue(outbox.sentEverything())
    }

    private fun callFailure(name: String = ANSWER_CHECK): IOException = try {
        runBlocking { mcp.callTool(name, JsonObject(emptyMap())) }
        throw AssertionError("$name was taken")
    } catch (failure: IOException) {
        failure
    }

    private fun answer(body: JsonObject): MockResponse {
        val id = body.getValue("id")
        return when (body.string("method")) {
            "tools/list", "resources/list" -> catalogueStatus?.let { MockResponse().setResponseCode(it) } ?: rpc(id) {
                putJsonObject("result") {
                    put("tools", buildJsonArray { add(buildJsonObject { put("name", ANSWER_CHECK) }) })
                    put("resources", buildJsonArray {})
                }
            }
            "tools/call" -> toolAnswer?.invoke(id) ?: rpc(id) { putJsonObject("result") { put("content", buildJsonArray {}) } }
            else -> MockResponse().setResponseCode(404)
        }
    }

    private fun rpc(id: JsonElement, fields: JsonObjectBuilder.() -> Unit): MockResponse {
        val body = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", id)
            fields()
        }
        return MockResponse().setHeader("Content-Type", "application/json").setBody(body.toString())
    }

    private companion object {
        const val OWNER = "uid-1/aaaaaaaaaaaa"
        const val ANSWER_CHECK = "answer_check"
    }
}

package com.latentic.graspy.mcp

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The host's side of MCP Apps, message by message, as the web's AppBridge answers them. */
class ViewSessionTest {
    private val card = ViewCard(
        resourceUri = "ui://graspy/practice",
        toolName = "give_practice",
        toolInput = buildJsonObject { put("instruction", "Add the fractions.") },
        toolResult = buildJsonObject { put("structuredContent", buildJsonObject { put("questions", 1) }) },
    )
    private val view = UiView("<p>practice</p>", "Practice", buildJsonObject { put("resourceDomains", "x") }, null)
    private val sent = mutableListOf<JsonObject>()
    private val host = RecordingHost()
    private val session = ViewSession(card, view, HostContext("yo"), host) { sent += it }

    @Test
    fun `the proxy gets the view's document once, with its policy`() = runBlocking {
        repeat(2) { session.receive(notification(ViewSession.PROXY_READY)) }

        assertEquals(1, sent.size)
        assertEquals(ViewSession.RESOURCE_READY, sent.single().method())
        val params = sent.single().params()
        assertEquals("<p>practice</p>", params.text("html"))
        assertEquals(view.csp, params["csp"])
    }

    @Test
    fun `initialise is answered with graspy, its capabilities and the learner's context`() = runBlocking {
        session.receive(request(7, ViewSession.INITIALIZE, buildJsonObject { put("protocolVersion", "1999-01-01") }))

        val result = sent.single()["result"]!!.jsonObject
        assertEquals(7, sent.single()["id"]!!.jsonPrimitive.int)
        assertEquals(ViewSession.LATEST_VERSION, result.text("protocolVersion"))
        assertEquals("graspy", result["hostInfo"]!!.jsonObject.text("name"))
        assertEquals(setOf("openLinks", "serverTools", "logging"), result["hostCapabilities"]!!.jsonObject.keys)
        val context = result["hostContext"]!!.jsonObject
        assertEquals("yo", context.text("locale"))
        assertEquals("inline", context.text("displayMode"))
        assertEquals(VIEW_MAX_HEIGHT, context["containerDimensions"]!!.jsonObject["maxHeight"]!!.jsonPrimitive.int)
    }

    @Test
    fun `once initialised the view is told its tool's input, then its result`() = runBlocking {
        session.receive(notification(ViewSession.INITIALIZED))

        assertEquals(listOf(ViewSession.TOOL_INPUT, ViewSession.TOOL_RESULT), sent.map { it.method() })
        assertEquals(card.toolInput, sent[0].params()["arguments"])
        assertEquals(card.toolResult, sent[1].params())
    }

    @Test
    fun `a view is shown only once it has drawn its result, not when it is told it`() = runBlocking {
        session.receive(notification(ViewSession.SIZE_CHANGED, buildJsonObject { put("height", 40) }))
        session.receive(notification(ViewSession.INITIALIZED))
        session.receive(notification(ViewSession.SIZE_CHANGED, buildJsonObject { put("height", 0) }))
        assertFalse(host.shown)

        session.receive(notification(ViewSession.SIZE_CHANGED, buildJsonObject { put("height", 420) }))
        assertTrue(host.shown)
    }

    @Test
    fun `a tool the view calls goes to the server, and the screen hears of it`() = runBlocking {
        val arguments = buildJsonObject { put("answer", 2) }
        session.receive(request(3, ViewSession.TOOLS_CALL, buildJsonObject { put("name", "answer_practice"); put("arguments", arguments) }))

        assertEquals(listOf("answer_practice" to arguments), host.calls)
        assertEquals(RecordingHost.RESULT, sent.single()["result"])
        assertEquals(listOf("answer_practice"), host.called)
    }

    @Test
    fun `a refused tool call comes back to the view as an error, and the screen hears nothing`() = runBlocking {
        session.receive(request(4, ViewSession.TOOLS_CALL, buildJsonObject { put("name", "rebuild_plan") }))

        assertEquals(ViewSession.INTERNAL_ERROR, sent.single()["error"]!!.jsonObject["code"]!!.jsonPrimitive.int)
        assertTrue(host.called.isEmpty())
    }

    @Test
    fun `a method graspy does not offer is refused by name`() = runBlocking {
        session.receive(request(5, "sampling/createMessage"))

        assertEquals(ViewSession.METHOD_NOT_FOUND, sent.single()["error"]!!.jsonObject["code"]!!.jsonPrimitive.int)
    }

    @Test
    fun `only web links open, and each is answered`() = runBlocking {
        session.receive(request(1, ViewSession.OPEN_LINK, buildJsonObject { put("url", "https://example.org/a") }))
        session.receive(request(2, ViewSession.OPEN_LINK, buildJsonObject { put("url", "intent://settings") }))

        assertEquals(listOf("https://example.org/a"), host.links)
        assertEquals(2, sent.count { it["result"] != null })
    }

    @Test
    fun `a view's height is followed up to the most a view may have`() = runBlocking {
        session.receive(notification(ViewSession.SIZE_CHANGED, buildJsonObject { put("height", 311.2) }))
        session.receive(notification(ViewSession.SIZE_CHANGED, buildJsonObject { put("height", 9000) }))

        assertEquals(listOf(312, VIEW_MAX_HEIGHT), host.heights)
    }

    @Test
    fun `a view's message is the screen's to take or refuse`() = runBlocking {
        val content = kotlinx.serialization.json.buildJsonArray {
            add(buildJsonObject { put("type", "text"); put("text", "Explain it again") })
        }
        host.takesMessages = false
        session.receive(request(9, ViewSession.MESSAGE, buildJsonObject { put("role", "user"); put("content", content) }))

        assertEquals(listOf("Explain it again"), host.messages)
        assertEquals(JsonPrimitive(true), sent.single()["result"]!!.jsonObject["isError"])
    }

    private class RecordingHost : ViewHost {
        val calls = mutableListOf<Pair<String, JsonObject>>()
        val called = mutableListOf<String>()
        val links = mutableListOf<String>()
        val heights = mutableListOf<Int>()
        val messages = mutableListOf<String>()
        var shown = false
        var takesMessages = true

        override suspend fun callTool(name: String, arguments: JsonObject): JsonObject {
            calls += name to arguments
            if (name == "rebuild_plan") throw McpRefusal("rebuild_plan cannot be called from a view")
            return RESULT
        }

        override fun toolCalled(name: String, arguments: JsonObject, result: JsonObject) {
            called += name
        }

        override fun message(text: String): Boolean {
            messages += text
            return takesMessages
        }

        override fun openLink(url: String) {
            links += url
        }

        override fun resize(height: Int) {
            heights += height
        }

        override fun shown() {
            shown = true
        }

        companion object {
            val RESULT = buildJsonObject { put("structuredContent", buildJsonObject { put("correct", true) }) }
        }
    }

    private fun request(id: Int, method: String, params: JsonObject = JsonObject(emptyMap())) = buildJsonObject {
        put("jsonrpc", "2.0")
        put("id", id)
        put("method", method)
        put("params", params)
    }

    private fun notification(method: String, params: JsonObject = JsonObject(emptyMap())) = buildJsonObject {
        put("jsonrpc", "2.0")
        put("method", method)
        put("params", params)
    }

    private fun JsonObject.method() = text("method")

    private fun JsonObject.params() = this["params"]!!.jsonObject

    private fun JsonObject.text(key: String) = this[key]!!.jsonPrimitive.content
}
